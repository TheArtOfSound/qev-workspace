import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrowserQevVaultAdapter, type DeviceIdentity } from "@qev-workspace/crypto";
import type { DeviceIdentityPublic, ProtocolEnvelope } from "@qev-workspace/protocol";
import { profileFromToken, getStoredToken } from "./auth";
import { SignalingClient } from "./signaling";
import { QevPeer } from "./webrtc";

const RELAY_URL =
  (import.meta.env.VITE_RELAY_URL as string | undefined)
  ?? (import.meta.env.DEV ? "ws://localhost:8787/ws" : "wss://qev-api.autohustle.online/ws");

type Mode = "home" | "host" | "viewer";
type Status = "idle" | "connecting" | "ready" | "waiting" | "sharing" | "watching" | "error";

type SimpleShareProps = {
  onBack: () => void;
};

export function SimpleShare({ onBack }: SimpleShareProps) {
  const [mode, setMode] = useState<Mode>("home");
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [peerName, setPeerName] = useState("");

  const vault = useRef(new BrowserQevVaultAdapter()).current;
  const clientRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<QevPeer | null>(null);
  const deviceRef = useRef<DeviceIdentity | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef("");

  const profile = (() => {
    const token = getStoredToken();
    return token ? profileFromToken(token) : null;
  })();

  useEffect(() => {
    return () => {
      teardown();
    };
  }, []);

  function teardown(): void {
    try {
      peerRef.current?.stop();
    } catch {
      // ignore
    }
    peerRef.current = null;
    try {
      clientRef.current?.close();
    } catch {
      // ignore
    }
    clientRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }

  async function ensureDevice(): Promise<DeviceIdentity> {
    if (deviceRef.current) return deviceRef.current;
    const existing = await vault.loadDeviceIdentity();
    if (existing) {
      deviceRef.current = existing;
      return existing;
    }
    const name = profile?.displayName?.trim() || "Guest";
    const created = await vault.createDeviceIdentity(name);
    deviceRef.current = created;
    return created;
  }

  function publicDevice(dev: DeviceIdentity): DeviceIdentityPublic {
    return {
      deviceId: dev.deviceId,
      displayName: dev.displayName,
      publicKeyJwk: dev.publicKeyJwk,
      createdAt: dev.createdAt,
    };
  }

  function makePeer(client: SignalingClient, deviceId: string, roomCode: string): QevPeer {
    return new QevPeer({
      onLocalIce: (candidate) => {
        client.sendSignal("signal.ice", roomCode, { candidate }, deviceId);
      },
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          void remoteVideoRef.current.play().catch(() => undefined);
        }
        setStatus("watching");
      },
      onLocalStream: (stream) => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          void localVideoRef.current.play().catch(() => undefined);
        }
      },
      onPointer: () => undefined,
      onAudit: () => undefined,
    });
  }

  async function handleSignal(
    message: ProtocolEnvelope,
    dev: DeviceIdentity,
    client: SignalingClient,
  ): Promise<void> {
    if (message.type === "room.created") {
      const payload = message.payload as { roomCode: string };
      roomRef.current = payload.roomCode;
      setCode(payload.roomCode);
      setStatus("waiting");
      setError("");
      return;
    }

    if (message.type === "room.joined") {
      const payload = message.payload as { roomCode: string; peer?: DeviceIdentityPublic };
      roomRef.current = payload.roomCode;
      setCode(payload.roomCode);
      if (payload.peer?.displayName) setPeerName(payload.peer.displayName);
      setStatus("ready");
      setError("");
      return;
    }

    if (message.type === "room.peer_joined") {
      const payload = message.payload as { device?: DeviceIdentityPublic };
      if (payload.device?.displayName) setPeerName(payload.device.displayName);
      setStatus((current) => (current === "sharing" ? current : "ready"));
      return;
    }

    if (message.type === "room.peer_left") {
      setPeerName("");
      setStatus((current) => (current === "sharing" ? "waiting" : "ready"));
      return;
    }

    if (message.type === "signal.offer") {
      const payload = message.payload as { description: RTCSessionDescriptionInit };
      const roomCode = message.roomCode ?? roomRef.current;
      if (!roomCode) return;

      peerRef.current?.stop();
      const peer = makePeer(client, dev.deviceId, roomCode);
      peerRef.current = peer;
      const answer = await peer.acceptOffer(payload.description, {});
      client.sendSignal("signal.answer", roomCode, { description: answer }, dev.deviceId);
      setStatus("watching");
      setMode("viewer");
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

    if (message.type === "error") {
      const payload = message.payload as { code?: string };
      setError(friendlyError(payload.code));
      setStatus("error");
    }
  }

  async function startHost(): Promise<void> {
    setError("");
    setCopied(false);
    setMode("host");
    setStatus("connecting");
    teardown();

    try {
      const dev = await ensureDevice();
      const client = new SignalingClient(RELAY_URL);
      client.onMessage = (message) => {
        void handleSignal(message, dev, client);
      };
      await client.connect();
      clientRef.current = client;
      client.createRoom(publicDevice(dev));
    } catch (reason) {
      setError(toMessage(reason));
      setStatus("error");
    }
  }

  async function joinShare(event: FormEvent): Promise<void> {
    event.preventDefault();
    const nextCode = joinCode.trim().toUpperCase();
    if (nextCode.length < 4) {
      setError("Enter the code from the person sharing.");
      return;
    }

    setError("");
    setMode("viewer");
    setStatus("connecting");
    teardown();

    try {
      const dev = await ensureDevice();
      const client = new SignalingClient(RELAY_URL);
      client.onMessage = (message) => {
        void handleSignal(message, dev, client);
      };
      await client.connect();
      clientRef.current = client;
      roomRef.current = nextCode;
      setCode(nextCode);
      client.joinRoom(nextCode, publicDevice(dev));
    } catch (reason) {
      setError(toMessage(reason));
      setStatus("error");
    }
  }

  async function shareScreen(): Promise<void> {
    setError("");
    try {
      const dev = deviceRef.current ?? (await ensureDevice());
      const client = clientRef.current;
      const roomCode = roomRef.current || code;
      if (!client || !roomCode) throw new Error("Start a share first.");

      peerRef.current?.stop();
      const peer = makePeer(client, dev.deviceId, roomCode);
      peerRef.current = peer;
      const offer = await peer.startScreenShare();
      client.sendSignal(
        "signal.offer",
        roomCode,
        { description: offer, mode: "screen" },
        dev.deviceId,
      );
      setStatus("sharing");
    } catch (reason) {
      setError(toMessage(reason));
      setStatus("error");
    }
  }

  function stopAll(): void {
    const client = clientRef.current;
    const dev = deviceRef.current;
    const roomCode = roomRef.current || code;
    if (client && dev && roomCode) {
      try {
        client.endSession(roomCode, dev.deviceId);
      } catch {
        // ignore
      }
    }
    teardown();
    setMode("home");
    setStatus("idle");
    setCode("");
    setJoinCode("");
    setPeerName("");
    setCopied(false);
    setError("");
  }

  async function copyCode(): Promise<void> {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Select the code and copy it yourself.");
    }
  }

  return (
    <div className="share" data-testid="simple-share">
      <header className="share__top">
        <div>
          <h1>Share screen</h1>
          <p>Show your screen to one person, or watch theirs.</p>
        </div>
        <button type="button" className="btn btn--muted" onClick={onBack}>
          Back to chat
        </button>
      </header>

      {error ? (
        <p className="share__error" role="alert">
          {error}
        </p>
      ) : null}

      {mode === "home" ? (
        <div className="share__grid">
          <section className="share__card">
            <h2>I want to share</h2>
            <p>Get a code, send it to them, then share your screen.</p>
            <button type="button" className="btn btn--green share__big" onClick={() => void startHost()}>
              Start sharing
            </button>
          </section>

          <section className="share__card">
            <h2>I want to watch</h2>
            <p>Paste the code they gave you.</p>
            <form className="share__join" onSubmit={(event) => void joinShare(event)}>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="CODE"
                autoComplete="off"
                maxLength={16}
                aria-label="Share code"
              />
              <button type="submit" className="btn btn--green">
                Join
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {mode === "host" ? (
        <div className="share__active">
          <section className="share__card">
            <h2>Your code</h2>
            <p className="share__code" data-testid="share-code">
              {code || (status === "connecting" ? "…" : "—")}
            </p>
            <div className="share__row">
              <button type="button" className="btn btn--muted" onClick={() => void copyCode()} disabled={!code}>
                {copied ? "Copied" : "Copy code"}
              </button>
              <button
                type="button"
                className="btn btn--green"
                onClick={() => void shareScreen()}
                disabled={!code || status === "connecting"}
              >
                {status === "sharing" ? "Sharing…" : "Share this screen"}
              </button>
              <button type="button" className="btn btn--danger" onClick={stopAll}>
                Stop
              </button>
            </div>
            <p className="share__hint">
              {statusLabel(status, "host", peerName)}
            </p>
          </section>

          <div className="share__videos">
            <div className="share__video-wrap">
              <span>You</span>
              <video ref={localVideoRef} muted playsInline autoPlay />
            </div>
          </div>
        </div>
      ) : null}

      {mode === "viewer" ? (
        <div className="share__active">
          <section className="share__card">
            <h2>Watching</h2>
            <p className="share__hint">{statusLabel(status, "viewer", peerName || code)}</p>
            <button type="button" className="btn btn--danger" onClick={stopAll}>
              Leave
            </button>
          </section>
          <div className="share__videos">
            <div className="share__video-wrap share__video-wrap--wide">
              <span>Their screen</span>
              <video ref={remoteVideoRef} playsInline autoPlay />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(status: Status, role: "host" | "viewer", peer: string): string {
  switch (status) {
    case "connecting":
      return "Connecting…";
    case "waiting":
      return role === "host"
        ? "Send the code. When they join, click Share this screen."
        : "Waiting…";
    case "ready":
      return peer
        ? `${peer} is here. Click Share this screen.`
        : "Ready. Click Share this screen.";
    case "sharing":
      return peer ? `Sharing with ${peer}.` : "You are sharing.";
    case "watching":
      return "You can see their screen.";
    case "error":
      return "Something went wrong.";
    default:
      return "";
  }
}

function friendlyError(code: string | undefined): string {
  switch (code) {
    case "room_not_found_or_expired":
      return "That code expired or is wrong.";
    case "room_full":
      return "That share is already full.";
    default:
      return code ? `Couldn't connect (${code}).` : "Couldn't connect.";
  }
}

function toMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Allow screen sharing, then try again.";
  }
  return reason instanceof Error ? reason.message : "Something went wrong.";
}
