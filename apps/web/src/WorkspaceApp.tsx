import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  BrowserQevVaultAdapter,
  decryptJson,
  derivePeerSessionKey,
  encryptJson,
  sessionFingerprint,
  type DeviceIdentity,
} from "@qev-workspace/crypto";
import {
  createId,
  type ControlGrantPayload,
  type ControlIntentPlaintext,
  type DeviceIdentityPublic,
  type EncryptedPayload,
  type PointerPayload,
  type ProtocolEnvelope,
} from "@qev-workspace/protocol";
import { SignalingClient, type SignalingStatus } from "./signaling";
import { QevPeer } from "./webrtc";
import { detectMediaPrivacyCapability, type MediaPrivacyCapability } from "./mediaPrivacy";
import { buildAgentCommand, buildAgentLaunchUrl, createPointerGrant, isGrantActive, type ControlGrant } from "./control";

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";
const LOCAL_AGENT_URL = "http://127.0.0.1:39483";
const TRUSTED_PEERS_STORAGE_KEY = "qev.workspace.trustedPeers.v1";

type SessionStatus = "none" | "created" | "joined" | "peer-connected" | "sharing" | "viewing" | "ended";

type PrivateChatPayload = {
  kind: "qev.chat.v1";
  id: string;
  body: string;
  sender: string;
  sentAt: string;
  roomLockHash?: string | null;
};

type PrivateProofPayload = {
  kind: "qev.private-proof.v1";
  proofId: string;
  mode: "ping" | "pong";
  senderDeviceId: string;
  senderName: string;
  roomCode: string;
  sessionId: string;
  roomLockHash?: string | null;
  sentAt: string;
};

type ChatEntry = PrivateChatPayload & {
  direction: "me" | "peer" | "system";
  encrypted: boolean;
};

type TrustedPeerRecord = {
  deviceId: string;
  displayName: string;
  publicKeyFingerprint: string;
  trustedAt: string;
  lastSeenAt: string;
};

type QevEncryptedExportFile = {
  version: "qev-encrypted-transcript-v1";
  alg: "PBKDF2-SHA256-AES-GCM";
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  ciphertext: string;
  exportedAt: string;
};

type WorkspaceSection = "workspace" | "setup" | "security" | "controls" | "logs";
type ThemeMode = "system" | "light" | "dark";

export function App() {
  const vault = useMemo(() => new BrowserQevVaultAdapter(), []);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<QevPeer | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  const frameMediaEncryptionEnabledRef = useRef(false);
  const lastPrivateProofIdRef = useRef("");
  const roomCodeLiveRef = useRef("");
  const sessionIdLiveRef = useRef("");
  const roomPassphraseLiveRef = useRef("");
  const deviceLiveRef = useRef<DeviceIdentity | null>(null);
  const displayNameLiveRef = useRef("QEV User");

  const [activeSection, setActiveSection] = useState<WorkspaceSection>("workspace");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof localStorage === "undefined") return "system";
    const saved = localStorage.getItem("qev.workspace.theme.v1");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [displayName, setDisplayName] = useState("QEV User");
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [peerDevice, setPeerDevice] = useState<DeviceIdentityPublic | null>(null);
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);

  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("room")?.toUpperCase() ?? "";
  });
  const [roomPassphrase, setRoomPassphrase] = useState("");
  const [roomLockFingerprint, setRoomLockFingerprint] = useState("not set");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [roomExpiresAt, setRoomExpiresAt] = useState("");
  const [roomLifecycleStatus, setRoomLifecycleStatus] = useState("no room");
  const [roomBurned, setRoomBurned] = useState(false);
  const [relayStatus, setRelayStatus] = useState<SignalingStatus>("idle");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("none");
  const [audit, setAudit] = useState<string[]>(["No session active."]);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [pointer, setPointer] = useState<PointerPayload | null>(null);
  const [error, setError] = useState("");
  const [controlRequested, setControlRequested] = useState(false);
  const [controlGrant, setControlGrant] = useState<ControlGrant | null>(null);
  const [agentCommandCopied, setAgentCommandCopied] = useState(false);

  const [incomingControlRequest, setIncomingControlRequest] = useState(false);
  const [viewerGrant, setViewerGrant] = useState<ControlGrantPayload | null>(null);
  const [hostGrant, setHostGrant] = useState<ControlGrantPayload | null>(null);
  const [lastControlIntent, setLastControlIntent] = useState("");
  const [localAgentStatus, setLocalAgentStatus] = useState("not checked");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [lastPrivateData, setLastPrivateData] = useState("none");
  const [privateChannelStatus, setPrivateChannelStatus] = useState("not tested");
  const [lastPrivateProofId, setLastPrivateProofId] = useState("");
  const [safetyVerified, setSafetyVerified] = useState(false);
  const [safetyVerifiedAt, setSafetyVerifiedAt] = useState("");
  const [localMediaVisible, setLocalMediaVisible] = useState(false);
  const [localMediaStatus, setLocalMediaStatus] = useState("idle");
  const [remoteVideoAspect, setRemoteVideoAspect] = useState("16 / 9");
  const [localVideoAspect, setLocalVideoAspect] = useState("16 / 9");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [lastExportStatus, setLastExportStatus] = useState("not exported");
  const [peerKeyFingerprint, setPeerKeyFingerprint] = useState("pending");
  const [peerTrustStatus, setPeerTrustStatus] = useState("pending peer");
  const [mediaPrivacy, setMediaPrivacy] = useState<MediaPrivacyCapability>(() => detectMediaPrivacyCapability());
  const [frameMediaEncryptionEnabled, setFrameMediaEncryptionEnabled] = useState(false);
  const [frameCryptoStatus, setFrameCryptoStatus] = useState("not attached");

  const fingerprint = device && sessionId ? sessionFingerprint(sessionId, device.deviceId, peerDevice?.deviceId) : "pending peer";
  const canJoin = relayStatus !== "connecting" && roomCode.trim().length >= 8;
  const canShare = Boolean(roomCode && sessionId && relayStatus === "open");
  const canStartMedia = Boolean(roomCode && sessionId && relayStatus === "open");
  const activeControlGrant = isGrantActive(controlGrant);
  const agentCommand = controlGrant ? buildAgentCommand(controlGrant) : "";
  const agentLaunchUrl = controlGrant ? buildAgentLaunchUrl(controlGrant) : "";
  const hasActiveViewerGrant = Boolean(viewerGrant && new Date(viewerGrant.expiresAt).getTime() > Date.now());
  const hasActiveHostGrant = Boolean(hostGrant && new Date(hostGrant.expiresAt).getTime() > Date.now());
  const canUsePrivateLayer = Boolean(sessionKey && peerDevice && safetyVerified);
  const canEnableQevMediaFrames = Boolean(frameMediaEncryptionEnabled && canUsePrivateLayer && mediaPrivacy.status === "ready");
  const mediaActionReason = !roomCode || !sessionId
    ? "Create or join a room first."
    : relayStatus !== "open"
      ? "Relay must be open before media can start."
      : !peerDevice
        ? "Wait for the other browser to join."
        : !sessionKey
          ? "Waiting for QEV key establishment."
          : !safetyVerified
            ? "Compare and verify the safety number first."
            : "Ready for screen share or video.";

  const safetyStatus = !peerDevice
    ? "pending peer"
    : !sessionKey
      ? "pending QEV key"
      : safetyVerified
        ? `verified${safetyVerifiedAt ? ` at ${new Date(safetyVerifiedAt).toLocaleTimeString()}` : ""}`
        : "unverified";

  const readinessItems: Array<{
    label: string;
    status: string;
    detail: string;
    state: "ready" | "action" | "waiting" | "blocked";
    section: WorkspaceSection;
  }> = [
    {
      label: "Identity",
      status: device ? "ready" : "needed",
      detail: device ? "This browser has a QEV device identity." : "Create identity before joining or hosting.",
      state: device ? "ready" : "action",
      section: "setup",
    },
    {
      label: "Room",
      status: roomCode && sessionId ? "active" : roomCode ? "join pending" : "needed",
      detail: roomCode && sessionId ? roomLifecycleStatus : roomCode ? "Join the invite code." : "Create or join a room.",
      state: roomCode && sessionId ? "ready" : "action",
      section: "setup",
    },
    {
      label: "Peer",
      status: peerDevice ? "connected" : "waiting",
      detail: peerDevice ? `${peerDevice.displayName} is connected.` : "Share invite or wait for the other browser.",
      state: peerDevice ? "ready" : "waiting",
      section: "setup",
    },
    {
      label: "Trust",
      status: canUsePrivateLayer ? "verified" : sessionKey ? "verify safety" : "waiting",
      detail: canUsePrivateLayer ? "Private actions are unlocked." : sessionKey ? "Compare safety number, then mark verified." : "Waiting for peer QEV key.",
      state: canUsePrivateLayer ? "ready" : sessionKey ? "action" : "waiting",
      section: "security",
    },
    {
      label: "Private channel",
      status: privateChannelStatus.startsWith("verified") ? "proven" : "not proven",
      detail: privateChannelStatus.startsWith("verified") ? privateChannelStatus : "Start media, then run private-channel proof.",
      state: privateChannelStatus.startsWith("verified") ? "ready" : canUsePrivateLayer ? "action" : "waiting",
      section: "security",
    },
  ];

  const nextAction: {
    title: string;
    detail: string;
    section: WorkspaceSection;
  } = !device
    ? {
        title: "Create this browser identity",
        detail: "Go to Setup and create the local QEV identity. Nothing private can be trusted before identity exists.",
        section: "setup",
      }
    : !roomCode || !sessionId
      ? {
          title: "Create or join a room",
          detail: "Use Setup to create a room or paste an invite code. Share the passphrase separately.",
          section: "setup",
        }
      : !peerDevice
        ? {
            title: "Connect the second person",
            detail: "Copy the invite link and wait for the other browser/device to join.",
            section: "setup",
          }
        : !sessionKey
          ? {
              title: "Wait for QEV key establishment",
              detail: "The peer is connected, but the QEV session key is still pending.",
              section: "security",
            }
          : !safetyVerified
            ? {
                title: "Verify the safety number",
                detail: "Compare the safety number with the other person before chat, media, or control.",
                section: "security",
              }
            : !remoteVisible
              ? {
                  title: "Start video or screen share",
                  detail: "The private layer is verified. Start media so the peer data channel opens.",
                  section: "workspace",
                }
              : !privateChannelStatus.startsWith("verified")
                ? {
                    title: "Verify the private channel",
                    detail: "Run the encrypted ping/pong proof so the user can see the private channel is working.",
                    section: "security",
                  }
                : {
                    title: "Workspace is ready",
                    detail: "Identity, room, peer, safety verification, media, and private-channel proof are in place.",
                    section: "workspace",
                  };

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (themeMode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", themeMode);
    }

    localStorage.setItem("qev.workspace.theme.v1", themeMode);
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;

    void computeRoomLockHash(roomCode, roomPassphrase).then((hash) => {
      if (cancelled) return;
      setRoomLockFingerprint(hash ? formatRoomLockFingerprint(hash) : "not set");
    });

    return () => {
      cancelled = true;
    };
  }, [roomCode, roomPassphrase]);

  useEffect(() => {
    function updateLifecycleStatus(): void {
      if (roomBurned) {
        setRoomLifecycleStatus("burned locally");
        return;
      }

      if (!roomCode) {
        setRoomLifecycleStatus("no room");
        return;
      }

      if (!roomExpiresAt) {
        setRoomLifecycleStatus("active / expiry unknown");
        return;
      }

      const expiresMs = new Date(roomExpiresAt).getTime();

      if (Number.isNaN(expiresMs)) {
        setRoomLifecycleStatus("active / invalid expiry");
        return;
      }

      const remaining = expiresMs - Date.now();

      if (remaining <= 0) {
        setRoomLifecycleStatus("expired");
        return;
      }

      setRoomLifecycleStatus(`expires in ${formatDuration(remaining)}`);
    }

    updateLifecycleStatus();
    const timer = window.setInterval(updateLifecycleStatus, 1000);

    return () => window.clearInterval(timer);
  }, [roomCode, roomExpiresAt, roomBurned]);

  useEffect(() => {
    roomCodeLiveRef.current = roomCode;
    sessionIdLiveRef.current = sessionId;
    roomPassphraseLiveRef.current = roomPassphrase;
    deviceLiveRef.current = device;
    displayNameLiveRef.current = displayName;
  }, [roomCode, sessionId, roomPassphrase, device, displayName]);

  useEffect(() => {
    void refreshPeerTrust(peerDevice);
  }, [peerDevice]);

  async function ensureDevice(): Promise<DeviceIdentity> {
    const existing = device ?? (await vault.loadDeviceIdentity());
    if (existing) {
      setDevice(existing);
      return existing;
    }

    const created = await vault.createDeviceIdentity(displayName.trim() || "QEV User");
    setDevice(created);
    addAudit(`Device identity created: ${created.deviceId}`);
    return created;
  }

  async function establishSessionKey(local: DeviceIdentity, peer: DeviceIdentityPublic | null | undefined): Promise<void> {
    if (!peer) {
      sessionKeyRef.current = null;
      setSessionKey(null);
      resetSafetyVerification();
      return;
    }
    const key = await derivePeerSessionKey(local, peer);
    sessionKeyRef.current = key;
    setSessionKey(key);
    resetSafetyVerification();
    addAudit("QEV session encryption key established with peer.");
  }

  function resetSafetyVerification(): void {
    setSafetyVerified(false);
    setSafetyVerifiedAt("");
  }

  function verifySafetyNumber(): void {
    if (!peerDevice || !sessionKey) {
      setError("Cannot verify safety number until a peer and QEV key are present.");
      return;
    }

    if (peerTrustStatus.startsWith("warning")) {
      addAudit("Safety verified despite remembered-key warning. Continue only if the peer confirmed the new key out-of-band.");
    }

    setSafetyVerified(true);
    setSafetyVerifiedAt(new Date().toISOString());
    addAudit("QEV safety number marked verified by local user.");
  }

  function clearSafetyVerification(): void {
    resetSafetyVerification();
    addAudit("QEV safety verification cleared.");
  }

  async function refreshPeerTrust(peer: DeviceIdentityPublic | null): Promise<void> {
    if (!peer) {
      setPeerKeyFingerprint("pending");
      setPeerTrustStatus("pending peer");
      return;
    }

    const fingerprint = await devicePublicKeyFingerprint(peer);
    setPeerKeyFingerprint(formatPeerKeyFingerprint(fingerprint));

    const records = loadTrustedPeerRecords();
    const existing = records[peer.deviceId];

    if (!existing) {
      setPeerTrustStatus("new peer / not remembered");
      return;
    }

    if (existing.publicKeyFingerprint !== fingerprint) {
      setPeerTrustStatus("warning / remembered key changed");
      resetSafetyVerification();
      addAudit("WARNING: remembered peer key changed. Verify out-of-band before trusting this session.");
      return;
    }

    setPeerTrustStatus(`recognized peer / trusted ${new Date(existing.trustedAt).toLocaleDateString()}`);
  }

  async function rememberVerifiedPeer(): Promise<void> {
    await safe(async () => {
      if (!peerDevice) throw new Error("No peer is connected.");
      if (!safetyVerified) throw new Error("Verify the safety number before remembering this peer.");

      const fingerprint = await devicePublicKeyFingerprint(peerDevice);
      const records = loadTrustedPeerRecords();

      records[peerDevice.deviceId] = {
        deviceId: peerDevice.deviceId,
        displayName: peerDevice.displayName,
        publicKeyFingerprint: fingerprint,
        trustedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      saveTrustedPeerRecords(records);
      setPeerKeyFingerprint(formatPeerKeyFingerprint(fingerprint));
      setPeerTrustStatus("remembered verified peer");
      addAudit(`Trusted peer remembered locally: ${peerDevice.displayName}.`);
    });
  }

  function forgetTrustedPeer(): void {
    if (!peerDevice) return;

    const records = loadTrustedPeerRecords();
    delete records[peerDevice.deviceId];
    saveTrustedPeerRecords(records);
    setPeerTrustStatus("forgotten / not remembered");
    addAudit(`Trusted peer forgotten locally: ${peerDevice.displayName}.`);
  }

  async function exportEncryptedTranscript(): Promise<void> {
    await safe(async () => {
      const passphrase = exportPassphrase.trim() || roomPassphrase.trim();

      if (!passphrase) {
        throw new Error("Enter an export passphrase before exporting.");
      }

      const transcript = {
        version: "qev-local-transcript-v1",
        exportedAt: new Date().toISOString(),
        roomCode: roomCode || null,
        sessionId: sessionId || null,
        localDeviceId: device?.deviceId ?? null,
        localDisplayName: displayName,
        peerDevice: peerDevice
          ? {
              deviceId: peerDevice.deviceId,
              displayName: peerDevice.displayName,
              publicKeyFingerprint: peerKeyFingerprint,
              trustStatus: peerTrustStatus,
            }
          : null,
        privacyState: {
          qevKey: sessionKey ? "established" : "pending",
          safetyNumber: fingerprint,
          safetyVerified,
          safetyVerifiedAt: safetyVerifiedAt || null,
          roomLockFingerprint,
        },
        chatMessages,
        audit,
      };

      const encrypted = await encryptTranscriptExport(passphrase, transcript);
      const safeRoom = (roomCode || "local").replace(/[^A-Z0-9-]/gi, "_");
      downloadJson(`qev-transcript-${safeRoom}-${Date.now()}.json`, encrypted);

      setLastExportStatus(`encrypted export downloaded at ${new Date().toLocaleTimeString()}`);
      addAudit("Encrypted local transcript export downloaded.");
    });
  }

  function clearLocalSessionData(): void {
    setChatInput("");
    setChatMessages([]);
    setLastPrivateData("none");
    setPrivateChannelStatus("local session data cleared");
    lastPrivateProofIdRef.current = "";
    setLastPrivateProofId("");
    setLastControlIntent("");
    setError("");
    setLastExportStatus("local session data cleared");
    setAudit([`${new Date().toLocaleTimeString()} — Local chat/audit/session data cleared from this browser view.`]);
  }

  function refreshMediaPrivacy(): void {
    const next = detectMediaPrivacyCapability();
    setMediaPrivacy(next);
    addAudit(`Media privacy capability checked: ${next.label}.`);
  }

  function setFrameMediaEncryptionRequirement(enabled: boolean): void {
    frameMediaEncryptionEnabledRef.current = enabled;
    setFrameMediaEncryptionEnabled(enabled);
    setFrameCryptoStatus(enabled ? "required for new media sessions" : "disabled for new media sessions");
    addAudit(enabled ? "QEV frame-level media encryption required for new media sessions." : "QEV frame-level media encryption disabled for new media sessions.");
  }

  async function connect(): Promise<SignalingClient> {
    const dev = await ensureDevice();
    const client = new SignalingClient(relayUrl.trim());
    client.onStatus = setRelayStatus;
    client.onAudit = addAudit;
    client.onMessage = (message) => void handleSignal(message, dev, client);
    await client.connect();
    signalingRef.current = client;
    return client;
  }

  async function createSession(): Promise<void> {
    await safe(async () => {
      clearPeerState();
      const dev = await ensureDevice();
      const client = await connect();
      client.createRoom(dev);
      addAudit("Requested new room from relay.");
    });
  }

  async function joinSession(): Promise<void> {
    await safe(async () => {
      const code = roomCode.trim().toUpperCase();
      const dev = await ensureDevice();
      const client = await connect();
      client.joinRoom(code, dev);
      addAudit(`Requested join for room ${code}.`);
    });
  }

  async function startShare(): Promise<void> {
    await safe(async () => {
      const dev = await ensureDevice();
      const client = signalingRef.current;
      if (!client || !roomCode) throw new Error("Create or join a room first.");
      if (!canUsePrivateLayer) throw new Error("Compare and verify the QEV safety number before starting screen share.");

      const peer = createPeer(client, dev.deviceId, roomCode, canEnableQevMediaFrames);
      peerRef.current = peer;

      const offer = await peer.startScreenShare();
      client.sendSignal("signal.offer", roomCode, { description: offer, mode: "screen", frameCrypto: canEnableQevMediaFrames }, dev.deviceId);
      setSessionStatus("sharing");
      addAudit("Screen-share offer sent. Browser permission was required.");
    });
  }

  async function startVideoCall(): Promise<void> {
    await safe(async () => {
      const dev = await ensureDevice();
      const client = signalingRef.current;
      if (!client || !roomCode) throw new Error("Create or join a room first.");
      if (!canUsePrivateLayer) throw new Error("Compare and verify the QEV safety number before starting video call.");

      const peer = createPeer(client, dev.deviceId, roomCode, canEnableQevMediaFrames);
      peerRef.current = peer;

      const offer = await peer.startCameraCall({ video: true, audio: true });
      client.sendSignal("signal.offer", roomCode, { description: offer, mode: "camera", frameCrypto: canEnableQevMediaFrames }, dev.deviceId);
      setSessionStatus("sharing");
      setLocalMediaStatus("camera + mic active");
      addAudit("Private video-call offer sent. Browser camera/mic permission was required.");
    });
  }

  async function requestControl(): Promise<void> {
    await safe(async () => {
      const dev = await ensureDevice();
      const client = signalingRef.current;
      if (!client || !roomCode) throw new Error("Join a session first.");
      if (!peerDevice) throw new Error("No peer connected yet.");
      if (!canUsePrivateLayer) throw new Error("Verify the QEV safety number before requesting control.");

      client.sendSignal(
        "control.request",
        roomCode,
        {
          scopes: ["pointer"],
          reason: "Viewer requested pointer control.",
          requestedAt: new Date().toISOString(),
        },
        dev.deviceId,
      );

      addAudit("Control request sent to host.");
    });
  }

  async function grantPointerControl(): Promise<void> {
    await safe(async () => {
      const dev = await ensureDevice();
      const client = signalingRef.current;
      if (!client || !roomCode) throw new Error("No active session.");
      if (!peerDevice) throw new Error("No peer to grant control to.");
      if (!canUsePrivateLayer) throw new Error("Verify the QEV safety number before granting control.");

      const grant: ControlGrantPayload = {
        grantId: createId("grant"),
        scopes: ["pointer"],
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        grantedByDeviceId: dev.deviceId,
        grantedToDeviceId: peerDevice.deviceId,
      };

      setHostGrant(grant);
      setIncomingControlRequest(false);
      await armLocalAgent(grant);
      client.sendSignal("control.grant", roomCode, grant, dev.deviceId);
      addAudit(`Pointer control granted to ${peerDevice.displayName} for 5 minutes.`);
    });
  }

  function revokeControl(): void {
    const client = signalingRef.current;
    if (device && client && roomCode) {
      try {
        client.sendSignal("control.revoke", roomCode, { reason: "host_revoked", at: new Date().toISOString() }, device.deviceId);
      } catch {
        // ignore
      }
    }

    setHostGrant(null);
    setViewerGrant(null);
    setIncomingControlRequest(false);
    resetSafetyVerification();
    void revokeLocalAgent();
    addAudit("Remote control revoked.");
  }

  function endSession(): void {
    if (device && roomCode) {
      try {
        signalingRef.current?.endSession(roomCode, device.deviceId);
      } catch {
        // ignore
      }
    }

    peerRef.current?.stop();
    signalingRef.current?.close();
    signalingRef.current = null;
    peerRef.current = null;
    setRelayStatus("closed");
    setSessionStatus("ended");
    setRemoteVisible(false);
    setLocalMediaVisible(false);
    setLocalMediaStatus("idle");
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setHostGrant(null);
    setViewerGrant(null);
    setIncomingControlRequest(false);
    void revokeLocalAgent();
    addAudit("Session ended locally.");
  }

  async function resetIdentity(): Promise<void> {
    await vault.resetDeviceIdentity();
    setDevice(null);
    clearPeerState();
    addAudit("Local device identity reset.");
  }

  async function copyInviteLink(): Promise<void> {
    await safe(async () => {
      if (!roomCode) throw new Error("Create or join a room before copying an invite link.");

      const url = new URL(window.location.href);
      url.searchParams.set("room", roomCode);
      url.hash = "";

      await navigator.clipboard.writeText(url.toString());
      setInviteCopied(true);

      if (roomPassphrase.trim()) {
        addAudit("Invite link copied. Share the room passphrase separately.");
      } else {
        addAudit("Invite link copied. No room passphrase is set.");
      }
    });
  }

  function burnRoom(): void {
    if (device && roomCode) {
      try {
        signalingRef.current?.endSession(roomCode, device.deviceId);
      } catch {
        // ignore
      }
    }

    peerRef.current?.stop();
    signalingRef.current?.close();
    signalingRef.current = null;
    peerRef.current = null;

    setRelayStatus("closed");
    setSessionStatus("ended");
    setRoomCode("");
    setSessionId("");
    setRoomExpiresAt("");
    setRoomPassphrase("");
    setRoomLockFingerprint("not set");
    setRoomBurned(true);
    setInviteCopied(false);

    setPeerDevice(null);
    sessionKeyRef.current = null;
    setSessionKey(null);
    resetSafetyVerification();

    setRemoteVisible(false);
    setLocalMediaVisible(false);
    setLocalMediaStatus("idle");
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setPointer(null);
    setHostGrant(null);
    setViewerGrant(null);
    setIncomingControlRequest(false);
    setControlRequested(false);
    setControlGrant(null);
    setAgentCommandCopied(false);

    setChatInput("");
    setChatMessages([]);
    setLastPrivateData("none");
    setPrivateChannelStatus("room burned locally");
    lastPrivateProofIdRef.current = "";
    setLastPrivateProofId("");
    setLastControlIntent("");
    setExportPassphrase("");
    setLastExportStatus("not exported");
    setFrameCryptoStatus("not attached");

    void revokeLocalAgent();
    clearRoomFromUrl();
    setAudit([`${new Date().toLocaleTimeString()} — Room burned locally. Invite, passphrase, peer session, media, chat, and grants cleared from this browser view.`]);
  }

  async function handleSignal(message: ProtocolEnvelope, dev: DeviceIdentity, client: SignalingClient): Promise<void> {
    if (message.type === "room.created") {
      const payload = message.payload as { roomCode: string; sessionId: string; expiresAt: string };
      roomCodeLiveRef.current = payload.roomCode;
      sessionIdLiveRef.current = payload.sessionId;
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      setRoomExpiresAt(payload.expiresAt);
      setRoomBurned(false);
      setSessionStatus("created");
      writeRoomToUrl(payload.roomCode);
      setInviteCopied(false);
    setFrameCryptoStatus("not attached");
      addAudit(`Room created: ${payload.roomCode}. Expires: ${payload.expiresAt}`);
      return;
    }

    if (message.type === "room.joined") {
      const payload = message.payload as { roomCode: string; sessionId: string; peer?: DeviceIdentityPublic; expiresAt?: string };
      roomCodeLiveRef.current = payload.roomCode;
      sessionIdLiveRef.current = payload.sessionId;
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      setRoomExpiresAt(payload.expiresAt ?? "");
      setRoomBurned(false);
      setPeerDevice(payload.peer ?? null);
      resetSafetyVerification();
      await establishSessionKey(dev, payload.peer);
      setSessionStatus("joined");
      writeRoomToUrl(payload.roomCode);
      setInviteCopied(false);
      addAudit(`Joined room: ${payload.roomCode}.`);
      return;
    }

    if (message.type === "room.peer_joined") {
      const payload = message.payload as { device?: DeviceIdentityPublic };
      setPeerDevice(payload.device ?? null);
      resetSafetyVerification();
      await establishSessionKey(dev, payload.device);
      setSessionStatus("peer-connected");
      addAudit(`Peer joined: ${payload.device?.displayName ?? "unknown device"}.`);
      return;
    }

    if (message.type === "room.peer_left") {
      addAudit("Peer disconnected.");
      resetSafetyVerification();
      clearPeerState();
      setSessionStatus("created");
      return;
    }

    if (message.type === "signal.offer") {
      const payload = message.payload as { description: RTCSessionDescriptionInit; mode?: "screen" | "camera"; frameCrypto?: boolean };
      const targetRoom = message.roomCode ?? roomCode;
      if (!targetRoom) throw new Error("Offer received without room code.");

      if (payload.frameCrypto && (!frameMediaEncryptionEnabledRef.current || detectMediaPrivacyCapability().status !== "ready" || !sessionKeyRef.current)) {
        throw new Error("Peer requires QEV frame-level media encryption. Enable it locally and verify the safety number first.");
      }

      const peer = createPeer(client, dev.deviceId, targetRoom, Boolean(payload.frameCrypto));
      peerRef.current = peer;
      const answer = await peer.acceptOffer(payload.description, payload.mode === "camera" ? { video: true, audio: true } : {});
      client.sendSignal("signal.answer", targetRoom, { description: answer }, dev.deviceId);
      setSessionStatus("viewing");
      if (payload.mode === "camera") setLocalMediaStatus("camera + mic active");
      return;
    }

    if (message.type === "signal.answer") {
      const payload = message.payload as { description: RTCSessionDescriptionInit };
      await peerRef.current?.acceptAnswer(payload.description);
      return;
    }

    if (message.type === "signal.ice") {
      const payload = message.payload as { candidate: RTCIceCandidateInit };
      await peerRef.current?.addIceCandidate(payload.candidate);
      return;
    }

    if (message.type === "control.request") {
      setIncomingControlRequest(true);
      addAudit("Peer requested pointer control. Host approval required.");
      return;
    }

    if (message.type === "control.grant") {
      const grant = message.payload as ControlGrantPayload;
      setViewerGrant(grant);
      addAudit(`Pointer control granted until ${new Date(grant.expiresAt).toLocaleTimeString()}.`);
      return;
    }

    if (message.type === "control.revoke") {
      setViewerGrant(null);
      setHostGrant(null);
      addAudit("Peer revoked remote control.");
      return;
    }

    if (message.type === "control.intent") {
      await receiveEncryptedControlIntent(message.payload as EncryptedPayload);
      return;
    }

    if (message.type === "permission.request") {
      setControlRequested(true);
      addAudit("Peer requested pointer control.");
      return;
    }

    if (message.type === "permission.grant") {
      const payload = message.payload as { grantId?: string; expiresAt?: string };
      addAudit(`Pointer-control grant received: ${payload.grantId ?? "unknown"}.`);
      return;
    }

    if (message.type === "permission.revoke") {
      setControlRequested(false);
      setControlGrant(null);
      setAgentCommandCopied(false);
      addAudit("Pointer control revoked by peer.");
      return;
    }

    if (message.type === "session.end") {
      addAudit("Peer ended the session.");
      endSession();
      return;
    }

    if (message.type === "error") {
      const text = `Relay error: ${JSON.stringify(message.payload)}`;
      setError(text);
      addAudit(text);
    }
  }


  async function receiveEncryptedPeerData(payload: EncryptedPayload): Promise<void> {
    const liveSessionKey = sessionKeyRef.current;
    const liveRoomCode = roomCodeLiveRef.current;
    const liveSessionId = sessionIdLiveRef.current;
    const livePassphrase = roomPassphraseLiveRef.current;

    if (!liveSessionKey) {
      addAudit("Rejected private peer data: no QEV session key.");
      return;
    }

    try {
      const message = await decryptJson<PrivateChatPayload | PrivateProofPayload>(liveSessionKey, payload);
      const localRoomLockHash = await computeRoomLockHash(liveRoomCode, livePassphrase);

      if ((message.roomLockHash ?? null) !== (localRoomLockHash ?? null)) {
        addAudit("Rejected encrypted peer data: room passphrase mismatch.");
        setPrivateChannelStatus("failed / room-lock mismatch");
        return;
      }

      if (message.kind === "qev.private-proof.v1") {
        if (message.roomCode !== liveRoomCode || message.sessionId !== liveSessionId) {
          setPrivateChannelStatus("failed / session mismatch");
          addAudit("Rejected private-channel proof: session mismatch.");
          return;
        }

        if (message.mode === "ping") {
          await respondToPrivateProof(message);
          return;
        }

        if (message.mode === "pong") {
          if (lastPrivateProofIdRef.current && message.proofId === lastPrivateProofIdRef.current) {
            setPrivateChannelStatus(`verified with ${message.senderName} at ${new Date(message.sentAt).toLocaleTimeString()}`);
            setLastPrivateData(`Private-channel proof verified at ${new Date(message.sentAt).toLocaleTimeString()}.`);
            addAudit("QEV encrypted private-channel proof verified.");
          } else {
            setPrivateChannelStatus("received unmatched proof response");
            addAudit("Received QEV private-channel proof response with unmatched proof ID.");
          }
          return;
        }
      }

      if (message.kind === "qev.chat.v1") {
        setChatMessages((current) => [
          ...current,
          {
            ...message,
            direction: "peer" as const,
            encrypted: true,
          },
        ].slice(-100));

        setLastPrivateData(`Encrypted chat received at ${new Date(message.sentAt).toLocaleTimeString()}.`);
        return;
      }

      addAudit("Ignored unknown encrypted peer data payload.");
    } catch {
      addAudit("Rejected private peer data: decrypt failed.");
    }
  }

  async function sendEncryptedChat(): Promise<void> {
    await safe(async () => {
      const body = chatInput.trim();

      if (!body) return;
      if (!sessionKey) throw new Error("QEV session key is not established yet.");
      if (!safetyVerified) throw new Error("Verify the QEV safety number before sending encrypted chat.");
      if (!peerRef.current) throw new Error("Peer channel is not ready yet.");

      const roomLockHash = await computeRoomLockHash(roomCode, roomPassphrase);

      const message: PrivateChatPayload = {
        kind: "qev.chat.v1",
        id: createId("chat"),
        body,
        sender: displayName.trim() || "QEV User",
        sentAt: new Date().toISOString(),
        roomLockHash,
      };

      const encrypted = await encryptJson(sessionKey, message);
      peerRef.current.sendEncrypted(encrypted);

      setChatMessages((current) => [
        ...current,
        {
          ...message,
          direction: "me" as const,
          encrypted: true,
        },
      ].slice(-100));

      setChatInput("");
      setLastPrivateData(`Encrypted chat sent at ${new Date(message.sentAt).toLocaleTimeString()}.`);
      addAudit("QEV encrypted chat message sent over peer data channel.");
    });
  }

  async function verifyPrivateChannel(): Promise<void> {
    await safe(async () => {
      const liveSessionKey = sessionKeyRef.current;
      const liveRoomCode = roomCodeLiveRef.current;
      const liveSessionId = sessionIdLiveRef.current;
      const liveDevice = deviceLiveRef.current;
      const liveName = displayNameLiveRef.current.trim() || "QEV User";

      if (!liveSessionKey) throw new Error("QEV session key is not established yet.");
      if (!safetyVerified) throw new Error("Verify the QEV safety number before testing the private channel.");
      if (!peerRef.current) throw new Error("Peer data channel is not ready. Start video or screen share first.");
      if (!liveDevice) throw new Error("Local device identity is missing.");
      if (!liveRoomCode || !liveSessionId) throw new Error("No active room/session.");

      const proofId = createId("proof");
      const roomLockHash = await computeRoomLockHash(liveRoomCode, roomPassphraseLiveRef.current);
      const proof: PrivateProofPayload = {
        kind: "qev.private-proof.v1",
        proofId,
        mode: "ping",
        senderDeviceId: liveDevice.deviceId,
        senderName: liveName,
        roomCode: liveRoomCode,
        sessionId: liveSessionId,
        roomLockHash,
        sentAt: new Date().toISOString(),
      };

      const encrypted = await encryptJson(liveSessionKey, proof);
      lastPrivateProofIdRef.current = proofId;
      setLastPrivateProofId(proofId);
      setPrivateChannelStatus("encrypted proof sent / waiting for peer");

      peerRef.current.sendEncrypted(encrypted);

      setLastPrivateData(`Private-channel proof sent at ${new Date(proof.sentAt).toLocaleTimeString()}.`);
      addAudit("QEV encrypted private-channel proof sent.");
    });
  }

  async function respondToPrivateProof(proof: PrivateProofPayload): Promise<void> {
    const liveSessionKey = sessionKeyRef.current;
    const liveDevice = deviceLiveRef.current;
    const liveRoomCode = roomCodeLiveRef.current;
    const liveSessionId = sessionIdLiveRef.current;
    const liveName = displayNameLiveRef.current.trim() || "QEV User";

    if (!liveSessionKey || !peerRef.current || !liveDevice) {
      addAudit("Could not answer private-channel proof: missing live key, peer, or device.");
      return;
    }

    const roomLockHash = await computeRoomLockHash(liveRoomCode, roomPassphraseLiveRef.current);
    const response: PrivateProofPayload = {
      kind: "qev.private-proof.v1",
      proofId: proof.proofId,
      mode: "pong",
      senderDeviceId: liveDevice.deviceId,
      senderName: liveName,
      roomCode: liveRoomCode,
      sessionId: liveSessionId,
      roomLockHash,
      sentAt: new Date().toISOString(),
    };

    const encrypted = await encryptJson(liveSessionKey, response);
    peerRef.current.sendEncrypted(encrypted);
    setPrivateChannelStatus("received proof / encrypted response sent");
    addAudit("QEV private-channel proof received and answered.");
  }

  async function receiveEncryptedControlIntent(payload: EncryptedPayload): Promise<void> {
    if (!sessionKey) {
      addAudit("Rejected control intent: no QEV session key.");
      return;
    }

    if (!hostGrant || new Date(hostGrant.expiresAt).getTime() <= Date.now()) {
      addAudit("Rejected control intent: no active host grant.");
      return;
    }

    try {
      const intent = await decryptJson<ControlIntentPlaintext>(sessionKey, payload);

      if (intent.grantId !== hostGrant.grantId) {
        addAudit("Rejected control intent: grant mismatch.");
        return;
      }

      if (intent.kind === "pointer.move" || intent.kind === "pointer.click") {
        setPointer({
          x: intent.x,
          y: intent.y,
          label: peerDevice?.displayName ?? "peer",
        });
        setLastControlIntent(intent.kind === "pointer.click" ? "Encrypted remote click received." : "Encrypted remote pointer move received.");
        await sendIntentToLocalAgent(intent);
      }

      if (intent.kind === "keyboard.intent") {
        setLastControlIntent(`Encrypted keyboard intent blocked in browser MVP: ${intent.key}`);
      }
    } catch {
      addAudit("Rejected control intent: decrypt failed.");
    }
  }

  function createPeer(client: SignalingClient, deviceId: string, targetRoomCode: string, useFrameCrypto = false): QevPeer {
    return new QevPeer({
      onLocalIce: (candidate) => client.sendSignal("signal.ice", targetRoomCode, { candidate }, deviceId),
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        setRemoteVisible(true);
        addAudit("Remote stream attached.");
      },
      onLocalStream: (stream) => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        setLocalMediaVisible(true);
        setLocalMediaStatus("local media active");
        addAudit("Local camera/microphone stream attached.");
      },
      onPointer: (payload) => setPointer(payload),
      onEncryptedData: (payload) => void receiveEncryptedPeerData(payload),
      onFrameCryptoStatus: (status) => {
        setFrameCryptoStatus(status.message);
        addAudit(status.message);
      },
      frameEncryptionKey: useFrameCrypto ? sessionKeyRef.current : null,
      onAudit: addAudit,
    });
  }

  async function sendEncryptedPointerIntent(event: MouseEvent<HTMLVideoElement>, kind: "pointer.move" | "pointer.click"): Promise<void> {
    if (!hasActiveViewerGrant || !viewerGrant || !sessionKey || !device || !roomCode) return;

    const client = signalingRef.current;
    if (!client) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);

    const intent: ControlIntentPlaintext =
      kind === "pointer.click"
        ? {
            kind,
            grantId: viewerGrant.grantId,
            x,
            y,
            button: "left",
            at: new Date().toISOString(),
          }
        : {
            kind,
            grantId: viewerGrant.grantId,
            x,
            y,
            at: new Date().toISOString(),
          };

    const encrypted = await encryptJson(sessionKey, intent);
    client.sendSignal("control.intent", roomCode, encrypted, device.deviceId);
  }


  async function grantControl(): Promise<void> {
    await safe(async () => {
      if (!roomCode || !sessionId) throw new Error("Create a session before granting control.");
      if (!canUsePrivateLayer) throw new Error("Verify the QEV safety number before creating a control grant.");

      const grant = createPointerGrant({
        roomCode,
        relayUrl,
        hostName: displayName.trim() || "QEV Host",
        minutes: 5,
      });

      setControlGrant(grant);
      setControlRequested(false);
      setAgentCommandCopied(false);
      await armLocalAgent({ grantId: grant.grantId, expiresAt: grant.expiresAt, roomCode: grant.roomCode, scopes: grant.scopes });

      if (device && signalingRef.current) {
        signalingRef.current.sendSignal(
          "permission.grant",
          roomCode,
          {
            grantId: grant.grantId,
            scopes: grant.scopes,
            expiresAt: grant.expiresAt,
          },
          device.deviceId,
        );
      }

      addAudit(`Pointer control granted for 5 minutes. Grant: ${grant.grantId}`);
    });
  }

  async function copyAgentCommand(): Promise<void> {
    if (!agentCommand) return;
    await navigator.clipboard.writeText(agentCommand);
    setAgentCommandCopied(true);
    addAudit("Host-agent launch command copied.");
  }

  function launchAgent(): void {
    if (!agentLaunchUrl) return;
    window.location.href = agentLaunchUrl;
    addAudit("Requested native QEV host-agent launch.");
  }


  async function checkLocalAgent(): Promise<void> {
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/health`);
      const json = await res.json() as { ok?: boolean; grantActive?: boolean };
      setLocalAgentStatus(json.ok ? `online${json.grantActive ? " / armed" : ""}` : "offline");
      addAudit("Local host agent check completed.");
    } catch {
      setLocalAgentStatus("offline");
      addAudit("Local host agent is not running on this computer.");
    }
  }

  async function armLocalAgent(grant: { grantId: string; expiresAt: string; roomCode?: string; scopes?: string[] }): Promise<void> {
    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId: grant.grantId,
          expiresAt: grant.expiresAt,
          roomCode,
          scopes: grant.scopes ?? ["pointer"],
        }),
      });

      if (!res.ok) throw new Error("agent_rejected_grant");
      setLocalAgentStatus("online / armed");
      addAudit("Local host agent armed with current grant.");
    } catch {
      setLocalAgentStatus("offline");
      addAudit("Grant created, but local host agent is not running on this computer.");
    }
  }

  async function sendIntentToLocalAgent(intent: ControlIntentPlaintext): Promise<void> {
    if (intent.kind === "keyboard.intent") return;

    try {
      const res = await fetch(`${LOCAL_AGENT_URL}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });

      if (!res.ok) throw new Error("agent_rejected_intent");
      setLocalAgentStatus("online / executing");
      addAudit(`Local host agent executed ${intent.kind}.`);
    } catch {
      setLocalAgentStatus("offline");
      addAudit("Local host agent did not execute the control intent.");
    }
  }

  async function revokeLocalAgent(): Promise<void> {
    try {
      await fetch(`${LOCAL_AGENT_URL}/revoke`, { method: "POST" });
      setLocalAgentStatus("online / revoked");
    } catch {
      setLocalAgentStatus("offline");
    }
  }

  async function safe(action: () => Promise<void>): Promise<void> {
    setError("");
    try {
      await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(message);
      addAudit(`Error: ${message}`);
    }
  }

  function clearPeerState(): void {
    setPeerDevice(null);
    sessionKeyRef.current = null;
    setSessionKey(null);
    resetSafetyVerification();
    setRemoteVisible(false);
    setLocalMediaVisible(false);
    setLocalMediaStatus("idle");
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setPointer(null);
    setHostGrant(null);
    setViewerGrant(null);
    setIncomingControlRequest(false);
    void revokeLocalAgent();
    setLastControlIntent("");
    setChatInput("");
    setChatMessages([]);
    setLastPrivateData("none");
    setPrivateChannelStatus("not tested");
    lastPrivateProofIdRef.current = "";
    setLastPrivateProofId("");
    setInviteCopied(false);
  }

  function addAudit(message: string): void {
    setAudit((current) => [`${new Date().toLocaleTimeString()} — ${message}`, ...current].slice(0, 60));
  }

  function updateVideoAspect(kind: "remote" | "local", video: HTMLVideoElement | null): void {
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    const aspect = `${width} / ${height}`;

    if (kind === "remote") {
      setRemoteVideoAspect(aspect);
      addAudit(`Remote stream resolution detected: ${width}×${height}.`);
    } else {
      setLocalVideoAspect(aspect);
      addAudit(`Local stream resolution detected: ${width}×${height}.`);
    }
  }

  return (
    <main
      className="shell"
      data-section={activeSection}
      data-qev-key={sessionKey ? "established" : "pending"}
      data-peer-connected={peerDevice ? "true" : "false"}
      data-safety-verified={safetyVerified ? "true" : "false"}
      data-private-channel={privateChannelStatus.startsWith("verified") ? "verified" : privateChannelStatus}
      data-private-data={lastPrivateData}
      data-proof-id={lastPrivateProofId}
      style={{
        "--qev-remote-aspect": remoteVideoAspect,
        "--qev-local-aspect": localVideoAspect,
      } as React.CSSProperties}
    >
      <section className="hero">
        <div>
          <p className="eyebrow">QEV Workspace</p>
          <h1>Consent-first remote workspace for teams.</h1>
          <p className="lede">
            Share a screen, verify the peer, and keep control permission explicit. Remote control is grant-based,
            QEV-encrypted, time-limited, and revocable.
          </p>
          <div className="safety-line">No silent access. No unattended control. No hidden monitoring.</div>
        </div>

        <div className="status-card">
          <span>Relay</span>
          <strong className={`status ${relayStatus}`}>{relayStatus}</strong>
          <small>{relayUrl}</small>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="workspace-chrome">
        <nav className="workspace-switcher" aria-label="QEV workspace sections">
          <button aria-label="Workspace" title="Workspace" className={activeSection === "workspace" ? "active" : ""} aria-pressed={activeSection === "workspace"} onClick={() => setActiveSection("workspace")}>
            Workspace
          </button>
          <button aria-label="Setup" title="Setup" className={activeSection === "setup" ? "active" : ""} aria-pressed={activeSection === "setup"} onClick={() => setActiveSection("setup")}>
            Setup
          </button>
          <button aria-label="Security" title="Security" className={activeSection === "security" ? "active" : ""} aria-pressed={activeSection === "security"} onClick={() => setActiveSection("security")}>
            Security
          </button>
          <button aria-label="Control" title="Control" className={activeSection === "controls" ? "active" : ""} aria-pressed={activeSection === "controls"} onClick={() => setActiveSection("controls")}>
            Control
          </button>
          <button aria-label="Logs" title="Logs" className={activeSection === "logs" ? "active" : ""} aria-pressed={activeSection === "logs"} onClick={() => setActiveSection("logs")}>
            Logs
          </button>
        </nav>

        <div className="theme-switcher" aria-label="Theme mode">
          <span>Theme</span>
          <button className={themeMode === "system" ? "active" : ""} aria-pressed={themeMode === "system"} onClick={() => setThemeMode("system")}>System</button>
          <button className={themeMode === "light" ? "active" : ""} aria-pressed={themeMode === "light"} onClick={() => setThemeMode("light")}>Light</button>
          <button className={themeMode === "dark" ? "active" : ""} aria-pressed={themeMode === "dark"} onClick={() => setThemeMode("dark")}>Dark</button>
        </div>
      </section>

      <section className="operator-strip" aria-label="QEV readiness and next action">
        <button className="next-action-card" type="button" onClick={() => setActiveSection(nextAction.section)}>
          <span>Next required action</span>
          <strong>{nextAction.title}</strong>
          <small>{nextAction.detail}</small>
        </button>

        <div className="readiness-strip">
          {readinessItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`readiness-card ${item.state}`}
              onClick={() => setActiveSection(item.section)}
              aria-label={`${item.label}: ${item.status}. ${item.detail}`}
            >
              <span>{item.label}</span>
              <strong>{item.status}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="download-strip">
        <div>
          <p className="eyebrow">Native Host Required</p>
          <h2>Download QEV Host for the computer you want to control.</h2>
          <p>
            The web app is for sessions and viewing. The controlled computer needs the QEV Host desktop app installed once
            so it can run at login, capture the screen, and execute approved control safely.
          </p>
        </div>
        <div className="download-actions">
          <a className="download-button" href="https://github.com/TheArtOfSound/qev-workspace/releases/latest" target="_blank" rel="noreferrer">
            Download QEV Host
          </a>
          <small>Mac DMG and Windows setup builds appear here after the release workflow finishes.</small>
        </div>
      </section>

      <section className="grid">
        <div className="panel identity-panel" data-section="setup">
          <h2>Identity</h2>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            Relay URL
            <input value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
          </label>
          <div className="button-row">
            <button onClick={() => void ensureDevice()}>Create identity</button>
            <button className="secondary" onClick={() => void resetIdentity()}>Reset identity</button>
          </div>
          <p className="mono">Device: {device ? device.deviceId : "not created"}</p>
        </div>

        <div className="panel session-panel" data-section="setup">
          <h2>Session</h2>
          <div className="button-row">
            <button onClick={() => void createSession()}>Create session</button>
            <button disabled={!canJoin} onClick={() => void joinSession()}>Join session</button>
          </div>
          <label>
            Session code
            <input value={roomCode} onChange={(event) => {
              setRoomCode(event.target.value.toUpperCase());
              setInviteCopied(false);
            }} placeholder="QEV-1234-ALPHA" />
          </label>
          <label>
            Room passphrase
            <input
              value={roomPassphrase}
              onChange={(event) => setRoomPassphrase(event.target.value)}
              placeholder="Optional. Share separately from invite link."
              type="password"
            />
          </label>
          <div className="control-grid">
            <p className="kv"><span>Invite</span><strong>{inviteCopied ? "copied" : roomCode ? "ready" : "pending room"}</strong></p>
            <p className="kv"><span>Lifecycle</span><strong>{roomLifecycleStatus}</strong></p>
            <p className="kv"><span>Invite expires</span><strong>{roomExpiresAt ? new Date(roomExpiresAt).toLocaleTimeString() : "unknown"}</strong></p>
            <p className="kv"><span>Room lock</span><strong>{roomLockFingerprint}</strong></p>
          </div>
          <div className="button-row">
            <button className="secondary" disabled={!roomCode} onClick={() => void copyInviteLink()}>Copy invite link</button>
            <button disabled={!canShare || !canUsePrivateLayer} onClick={() => void startShare()}>Share screen with browser prompt</button>
            <button disabled={!canStartMedia || !canUsePrivateLayer} onClick={() => void startVideoCall()}>Start private video call</button>
            <button className="danger" onClick={endSession}>End session</button>
            <button className="danger" disabled={!roomCode && !sessionId} onClick={burnRoom}>Burn room locally</button>
          </div>
        </div>

        <div className="panel consent-panel" data-section="security">
          <h2>Consent state</h2>
          <p className="kv"><span>Session</span><strong>{sessionStatus}</strong></p>
          <p className="kv"><span>Session ID</span><strong>{sessionId || "not created"}</strong></p>
          <p className="kv"><span>Peer</span><strong>{peerDevice?.displayName ?? "pending"}</strong></p>
          <p className={`kv ${peerTrustStatus.startsWith("warning") ? "trust-warning" : ""}`}><span>Peer trust</span><strong>{peerTrustStatus}</strong></p>
          <p className="kv"><span>Peer key</span><strong>{peerKeyFingerprint}</strong></p>
          <p className="kv"><span>Safety number</span><strong>{fingerprint}</strong></p>
          <p className="kv"><span>QEV key</span><strong>{sessionKey ? "established" : "pending"}</strong></p>
          <p className="kv"><span>Private channel</span><strong>{privateChannelStatus}</strong></p>
          <p className="kv"><span>Safety verification</span><strong>{safetyStatus}</strong></p>
          <div className="button-row safety-actions">
            <button disabled={!sessionKey || !peerDevice || safetyVerified} onClick={verifySafetyNumber}>
              Mark safety number verified
            </button>
            <button className="secondary" disabled={!safetyVerified} onClick={clearSafetyVerification}>
              Clear verification
            </button>
            <button className="secondary" disabled={!peerDevice || !safetyVerified} onClick={() => void rememberVerifiedPeer()}>
              Remember verified peer
            </button>
            <button className="secondary" disabled={!peerDevice} onClick={forgetTrustedPeer}>
              Forget peer
            </button>
            <button className="secondary" disabled={!canUsePrivateLayer || !remoteVisible} onClick={() => void verifyPrivateChannel()}>
              Verify private channel
            </button>
          </div>
          <p className="safety-note">
            Compare this safety number with the other person before using private chat, screen share, video, or control.
            Trust pinning remembers the peer key locally and warns if that key changes later.
          </p>

          <div className="privacy-box">
            <h3>Local privacy controls</h3>
            <p>
              Export is encrypted in this browser before download. QEV does not create a plaintext transcript file.
            </p>
            <label>
              Export passphrase
              <input
                value={exportPassphrase}
                onChange={(event) => setExportPassphrase(event.target.value)}
                placeholder="Required for encrypted transcript export"
                type="password"
              />
            </label>
            <div className="button-row">
              <button className="secondary" disabled={!exportPassphrase.trim() && !roomPassphrase.trim()} onClick={() => void exportEncryptedTranscript()}>
                Export encrypted transcript
              </button>
              <button className="danger" onClick={clearLocalSessionData}>
                Clear local session data
              </button>
            </div>
            <p className="kv"><span>Export</span><strong>{lastExportStatus}</strong></p>
          </div>

          <div className={`privacy-box media-privacy-box media-${mediaPrivacy.status}`}>
            <h3>Media privacy hardening</h3>
            <p>
              Video and screen-share media currently use WebRTC transport encryption. QEV frame-level media encryption
              requires browser encoded-frame transform support.
            </p>
            <div className="control-grid">
              <p className="kv"><span>Media status</span><strong>{mediaPrivacy.label}</strong></p>
              <p className="kv"><span>Secure context</span><strong>{mediaPrivacy.secureContext ? "yes" : "no"}</strong></p>
              <p className="kv"><span>WebRTC</span><strong>{mediaPrivacy.webRtc ? "available" : "blocked"}</strong></p>
              <p className="kv"><span>Camera/screen APIs</span><strong>{mediaPrivacy.mediaDevices ? "available" : "blocked"}</strong></p>
              <p className="kv"><span>Encoded transform</span><strong>{mediaPrivacy.insertableStreams ? "available" : "not available"}</strong></p>
              <p className="kv"><span>QEV frame encryption</span><strong>{mediaPrivacy.qevFrameEncryption}</strong></p>
            </div>
            <ul className="media-notes">
              {mediaPrivacy.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="button-row">
              <button className="secondary" onClick={refreshMediaPrivacy}>
                Refresh media privacy check
              </button>
            </div>
          </div>
          <div className={sessionStatus === "sharing" || sessionStatus === "viewing" ? "indicator live" : "indicator"}>
            {sessionStatus === "sharing" ? "You are sharing your screen" : sessionStatus === "viewing" ? "You are viewing a shared screen" : "No active screen session"}
          </div>
        </div>

        <div className="panel wide control-panel control-permission-panel" data-section="controls">
          <h2>Remote control permission</h2>
          <p>
            Browser MVP supports encrypted control intents. OS mouse/keyboard injection remains blocked until the
            native desktop agent is installed and explicitly approved.
          </p>
          <div className="button-row">
            <button disabled={!remoteVisible || !canUsePrivateLayer || hasActiveViewerGrant} onClick={() => void requestControl()}>
              Request pointer control
            </button>
            <button disabled={!incomingControlRequest || !canUsePrivateLayer} onClick={() => void grantPointerControl()}>
              Grant pointer control for 5 minutes
            </button>
            <button className="danger" disabled={!hasActiveHostGrant && !hasActiveViewerGrant} onClick={revokeControl}>
              Revoke control
            </button>
            <button className="secondary" onClick={() => void checkLocalAgent()}>
              Check local agent
            </button>
          </div>
          <div className="control-grid">
            <p className="kv"><span>Incoming request</span><strong>{incomingControlRequest ? "waiting for host approval" : "none"}</strong></p>
            <p className="kv"><span>Viewer grant</span><strong>{hasActiveViewerGrant ? `active until ${new Date(viewerGrant!.expiresAt).toLocaleTimeString()}` : "none"}</strong></p>
            <p className="kv"><span>Host grant</span><strong>{hasActiveHostGrant ? `active until ${new Date(hostGrant!.expiresAt).toLocaleTimeString()}` : "none"}</strong></p>
            <p className="kv"><span>Last intent</span><strong>{lastControlIntent || "none"}</strong></p>
            <p className="kv"><span>Local agent</span><strong>{localAgentStatus}</strong></p>
          </div>
        </div>

        <div className="panel wide control-panel control-legacy-panel" data-section="controls">
          <h2>Remote control</h2>
          <p>
            Browser screen sharing is live. Actual OS control requires the visible QEV host agent on the machine being controlled.
            Control is time-limited, revocable, and never silent.
          </p>

          <div className="button-row">
            <button disabled={!sessionId || sessionStatus === "none" || !canUsePrivateLayer} onClick={() => void requestControl()}>
              Request control
            </button>
            <button disabled={!sessionId || !canUsePrivateLayer} onClick={() => void grantControl()}>
              Grant pointer control for 5 minutes
            </button>
            <button className="secondary" disabled={!controlGrant} onClick={() => void copyAgentCommand()}>
              Copy host-agent command
            </button>
            <button className="secondary" disabled={!controlGrant} onClick={launchAgent}>
              Launch installed agent
            </button>
            <button className="danger" disabled={!controlGrant && !controlRequested} onClick={revokeControl}>
              Revoke control
            </button>
          </div>

          <div className="control-grid">
            <p className="kv"><span>Request</span><strong>{controlRequested ? "peer is requesting control" : "none"}</strong></p>
            <p className="kv"><span>Grant</span><strong>{activeControlGrant ? "active" : "inactive"}</strong></p>
            <p className="kv"><span>Grant ID</span><strong>{controlGrant?.grantId ?? "none"}</strong></p>
            <p className="kv"><span>Expires</span><strong>{controlGrant ? new Date(controlGrant.expiresAt).toLocaleTimeString() : "none"}</strong></p>
            <p className="kv"><span>Agent command</span><strong>{agentCommandCopied ? "copied" : controlGrant ? "ready" : "not generated"}</strong></p>
            <p className="kv"><span>Native launch</span><strong>{controlGrant ? "qevworkspace:// ready" : "not ready"}</strong></p>
          </div>

          {controlGrant ? (
            <pre className="agent-command">{agentCommand}</pre>
          ) : null}
        </div>

        <div className="panel wide local-preview" data-section="workspace">
          <h2>Local camera / mic</h2>
          <p>
            Your local media stays visible here when camera/mic is active. Browser permission is required every time.
          </p>
          <div className="control-grid">
            <p className="kv"><span>Local media</span><strong>{localMediaStatus}</strong></p>
            <p className="kv"><span>Privacy layer</span><strong>{mediaPrivacy.label}</strong></p>
          </div>
          <div className="video-wrap local-wrap">
            <video
              ref={localVideoRef}
              className={localMediaVisible ? "remote active" : "remote"}
              onLoadedMetadata={(event) => updateVideoAspect("local", event.currentTarget)}
              onPlay={(event) => updateVideoAspect("local", event.currentTarget)}
              autoPlay
              muted
              playsInline
            />
            {!localMediaVisible ? <div className="empty-video">No local camera/mic stream active.</div> : null}
          </div>
        </div>

        <div className="panel wide remote-stage" data-section="workspace">
          <div className="workspace-media-header">
            <div>
              <h2>Remote screen</h2>
              <p>{mediaActionReason}</p>
            </div>
            <div className="workspace-media-actions">
              <button disabled={!canShare || !canUsePrivateLayer} onClick={() => void startShare()}>
                Share screen + audio
              </button>
              <button disabled={!canStartMedia || !canUsePrivateLayer} onClick={() => void startVideoCall()}>
                Start camera / mic
              </button>
              <button className="secondary" disabled={!sessionKey || !peerDevice || safetyVerified} onClick={verifySafetyNumber}>
                Verify safety
              </button>
            </div>
          </div>
          <div className="video-wrap">
            <video
              ref={remoteVideoRef}
              className={remoteVisible ? "remote active" : "remote"}
              onLoadedMetadata={(event) => updateVideoAspect("remote", event.currentTarget)}
              onPlay={(event) => updateVideoAspect("remote", event.currentTarget)}
              autoPlay
              controls={remoteVisible}
              playsInline
              onMouseMove={(event) => void sendEncryptedPointerIntent(event, "pointer.move")}
              onClick={(event) => void sendEncryptedPointerIntent(event, "pointer.click")}
            />
            {!remoteVisible ? <div className="empty-video">No remote stream attached yet.</div> : null}
            {pointer && remoteVisible ? (
              <div
                className="pointer"
                style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
                title={pointer.label}
              />
            ) : null}
          </div>
        </div>

        <div className="panel wide audit-panel" data-section="logs">
          <h2>Audit</h2>
          <ul className="audit">
            {audit.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

async function encryptTranscriptExport(passphrase: string, value: unknown): Promise<QevEncryptedExportFile> {
  const iterations = 210_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: asStrictBufferSource(salt),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt"],
  );

  const plaintext = new TextEncoder().encode(JSON.stringify(value, null, 2));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asStrictBufferSource(iv),
    },
    key,
    asStrictBufferSource(plaintext),
  );

  return {
    version: "qev-encrypted-transcript-v1",
    alg: "PBKDF2-SHA256-AES-GCM",
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: bytesToBase64(salt),
    },
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    exportedAt: new Date().toISOString(),
  };
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function asStrictBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function loadTrustedPeerRecords(): Record<string, TrustedPeerRecord> {
  if (typeof localStorage === "undefined") return {};

  const raw = localStorage.getItem(TRUSTED_PEERS_STORAGE_KEY);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, TrustedPeerRecord>;
  } catch {
    localStorage.removeItem(TRUSTED_PEERS_STORAGE_KEY);
    return {};
  }
}

function saveTrustedPeerRecords(records: Record<string, TrustedPeerRecord>): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TRUSTED_PEERS_STORAGE_KEY, JSON.stringify(records));
}

async function devicePublicKeyFingerprint(peer: DeviceIdentityPublic): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(peer.publicKeyJwk));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

function formatPeerKeyFingerprint(hash: string): string {
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`.toUpperCase();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function writeRoomToUrl(roomCode: string): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

function clearRoomFromUrl(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return `${hours}h ${restMinutes}m`;
  }

  return `${minutes}m ${seconds}s`;
}

async function computeRoomLockHash(roomCode: string, passphrase: string): Promise<string | null> {
  const normalizedPassphrase = passphrase.trim();

  if (!normalizedPassphrase) return null;

  const material = `qev-room-lock-v1:${roomCode.trim().toUpperCase()}:${normalizedPassphrase}`;
  const encoded = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToHex(new Uint8Array(digest));
}

function formatRoomLockFingerprint(hash: string): string {
  return `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`.toUpperCase();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
