import { useMemo, useRef, useState } from "react";
import { BrowserQevVaultAdapter, sessionFingerprint, type DeviceIdentity } from "@qev-workspace/crypto";
import { type DeviceIdentityPublic, type PointerPayload, type ProtocolEnvelope } from "@qev-workspace/protocol";
import { SignalingClient, type SignalingStatus } from "./signaling";
import { QevPeer } from "./webrtc";

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";

type SessionStatus = "none" | "created" | "joined" | "peer-connected" | "sharing" | "viewing" | "ended";

export function App() {
  const vault = useMemo(() => new BrowserQevVaultAdapter(), []);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<QevPeer | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [displayName, setDisplayName] = useState("QEV User");
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [peerDevice, setPeerDevice] = useState<DeviceIdentityPublic | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [relayStatus, setRelayStatus] = useState<SignalingStatus>("idle");
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("none");
  const [audit, setAudit] = useState<string[]>(["No session active."]);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [pointer, setPointer] = useState<PointerPayload | null>(null);
  const [error, setError] = useState("");

  const fingerprint = device && sessionId ? sessionFingerprint(sessionId, device.deviceId, peerDevice?.deviceId) : "pending peer";
  const canCreate = relayStatus !== "connecting";
  const canJoin = relayStatus !== "connecting" && roomCode.trim().length >= 8;
  const canShare = Boolean(roomCode && sessionId && relayStatus === "open");

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
      setSessionStatus("none");
      setPeerDevice(null);
      setRemoteVisible(false);
      setRoomCode("");
      setSessionId("");
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

      const peer = createPeer(client, dev.deviceId, roomCode);
      peerRef.current = peer;

      const offer = await peer.startScreenShare();
      client.sendSignal("signal.offer", roomCode, { description: offer }, dev.deviceId);
      setSessionStatus("sharing");
      addAudit("Screen-share offer sent. Browser permission was required.");
    });
  }

  function endSession(): void {
    if (device && roomCode) {
      try {
        signalingRef.current?.endSession(roomCode, device.deviceId);
      } catch {
        // Ignore end-session send failures.
      }
    }

    peerRef.current?.stop();
    signalingRef.current?.close();
    signalingRef.current = null;
    peerRef.current = null;
    setRelayStatus("closed");
    setSessionStatus("ended");
    setRemoteVisible(false);
    addAudit("Session ended locally.");
  }

  async function resetIdentity(): Promise<void> {
    await vault.resetDeviceIdentity();
    setDevice(null);
    setPeerDevice(null);
    addAudit("Local device identity reset.");
  }

  async function handleSignal(message: ProtocolEnvelope, dev: DeviceIdentity, client: SignalingClient): Promise<void> {
    if (message.type === "room.created") {
      const payload = message.payload as { roomCode: string; sessionId: string; expiresAt: string };
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      setSessionStatus("created");
      addAudit(`Room created: ${payload.roomCode}. Expires: ${payload.expiresAt}`);
      return;
    }

    if (message.type === "room.joined") {
      const payload = message.payload as { roomCode: string; sessionId: string; peer?: DeviceIdentityPublic };
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      setPeerDevice(payload.peer ?? null);
      setSessionStatus("joined");
      addAudit(`Joined room: ${payload.roomCode}.`);
      return;
    }

    if (message.type === "room.peer_joined") {
      const payload = message.payload as { device?: DeviceIdentityPublic };
      setPeerDevice(payload.device ?? null);
      setSessionStatus("peer-connected");
      addAudit(`Peer joined: ${payload.device?.displayName ?? "unknown device"}.`);
      return;
    }

    if (message.type === "room.peer_left") {
      addAudit("Peer disconnected.");
      setPeerDevice(null);
      setSessionStatus("created");
      return;
    }

    if (message.type === "signal.offer") {
      const payload = message.payload as { description: RTCSessionDescriptionInit };
      const targetRoom = message.roomCode ?? roomCode;
      if (!targetRoom) throw new Error("Offer received without room code.");

      const peer = createPeer(client, dev.deviceId, targetRoom);
      peerRef.current = peer;
      const answer = await peer.acceptOffer(payload.description);
      client.sendSignal("signal.answer", targetRoom, { description: answer }, dev.deviceId);
      setSessionStatus("viewing");
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

  function createPeer(client: SignalingClient, deviceId: string, targetRoomCode: string): QevPeer {
    return new QevPeer({
      onLocalIce: (candidate) => client.sendSignal("signal.ice", targetRoomCode, { candidate }, deviceId),
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        setRemoteVisible(true);
        addAudit("Remote stream attached.");
      },
      onPointer: (payload) => setPointer(payload),
      onAudit: addAudit,
    });
  }

  function sendPointer(event: React.MouseEvent<HTMLVideoElement>): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    peerRef.current?.sendPointer({
      x,
      y,
      label: displayName.trim() || "peer",
    });
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

  function addAudit(message: string): void {
    setAudit((current) => [`${new Date().toLocaleTimeString()} — ${message}`, ...current].slice(0, 40));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">QEV Workspace</p>
          <h1>Consent-first remote workspace for teams.</h1>
          <p className="lede">
            Share a screen, verify the peer, and keep the session visible. Native remote control remains locked
            until the desktop-agent consent model is hardened.
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

      <section className="grid">
        <div className="panel">
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

        <div className="panel">
          <h2>Session</h2>
          <div className="button-row">
            <button disabled={!canCreate} onClick={() => void createSession()}>Create session</button>
            <button disabled={!canJoin} onClick={() => void joinSession()}>Join session</button>
          </div>
          <label>
            Session code
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="QEV-1234-ALPHA" />
          </label>
          <div className="button-row">
            <button disabled={!canShare} onClick={() => void startShare()}>Share screen with browser prompt</button>
            <button className="danger" onClick={endSession}>End session</button>
          </div>
        </div>

        <div className="panel">
          <h2>Consent state</h2>
          <p className="kv"><span>Session</span><strong>{sessionStatus}</strong></p>
          <p className="kv"><span>Session ID</span><strong>{sessionId || "not created"}</strong></p>
          <p className="kv"><span>Peer</span><strong>{peerDevice?.displayName ?? "pending"}</strong></p>
          <p className="kv"><span>Safety number</span><strong>{fingerprint}</strong></p>
          <div className={sessionStatus === "sharing" || sessionStatus === "viewing" ? "indicator live" : "indicator"}>
            {sessionStatus === "sharing" ? "You are sharing your screen" : sessionStatus === "viewing" ? "You are viewing a shared screen" : "No active screen session"}
          </div>
        </div>

        <div className="panel wide">
          <h2>Remote screen</h2>
          <div className="video-wrap">
            <video
              ref={remoteVideoRef}
              className={remoteVisible ? "remote active" : "remote"}
              autoPlay
              playsInline
              onMouseMove={sendPointer}
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

        <div className="panel wide">
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

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
