import { useMemo, useRef, useState } from "react";
import { InMemoryQevVaultAdapter, sessionFingerprint, type DeviceIdentity } from "@qev-workspace/crypto";
import { type ProtocolEnvelope } from "@qev-workspace/protocol";
import { SignalingClient, type SignalingStatus } from "./signaling";
import { QevPeer } from "./webrtc";

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "ws://localhost:8787/ws";

export function App() {
  const vault = useMemo(() => new InMemoryQevVaultAdapter(), []);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<QevPeer | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [relayUrl, setRelayUrl] = useState(DEFAULT_RELAY_URL);
  const [displayName, setDisplayName] = useState("QEV User");
  const [device, setDevice] = useState<DeviceIdentity | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<SignalingStatus>("idle");
  const [audit, setAudit] = useState<string[]>(["No session active."]);
  const [fingerprint, setFingerprint] = useState("");
  const [remoteVisible, setRemoteVisible] = useState(false);

  async function ensureDevice(): Promise<DeviceIdentity> {
    const existing = device ?? (await vault.loadDeviceIdentity());
    if (existing) return existing;
    const created = await vault.createDeviceIdentity(displayName.trim() || "QEV User");
    setDevice(created);
    addAudit(`Device identity created: ${created.deviceId}`);
    return created;
  }

  async function connect(): Promise<SignalingClient> {
    const dev = await ensureDevice();
    const client = new SignalingClient(relayUrl);
    client.onStatus = setStatus;
    client.onMessage = (message) => void handleSignal(message, dev, client);
    client.connect();
    signalingRef.current = client;
    return client;
  }

  async function createSession(): Promise<void> {
    const dev = await ensureDevice();
    const client = await connect();
    setTimeout(() => client.createRoom(dev), 150);
  }

  async function joinSession(): Promise<void> {
    const dev = await ensureDevice();
    const client = await connect();
    setTimeout(() => client.joinRoom(roomCode, dev), 150);
  }

  async function startShare(): Promise<void> {
    const dev = await ensureDevice();
    const client = signalingRef.current;
    if (!client || !roomCode) throw new Error("Create or join a room first.");

    const peer = createPeer(client, dev.deviceId, roomCode);
    peerRef.current = peer;
    const offer = await peer.startScreenShare();
    client.sendSignal("signal.offer", roomCode, { description: offer }, dev.deviceId);
    addAudit("Screen-share offer sent. Browser permission was required.");
  }

  function endSession(): void {
    if (device && roomCode) signalingRef.current?.endSession(roomCode, device.deviceId);
    peerRef.current?.stop();
    signalingRef.current?.close();
    setStatus("closed");
    addAudit("Session ended locally.");
  }

  async function handleSignal(message: ProtocolEnvelope, dev: DeviceIdentity, client: SignalingClient): Promise<void> {
    if (message.type === "room.created") {
      const payload = message.payload as { roomCode: string; sessionId: string; expiresAt: string };
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      addAudit(`Session created. Code ${payload.roomCode} expires at ${payload.expiresAt}.`);
      return;
    }

    if (message.type === "room.joined") {
      const payload = message.payload as { roomCode: string; sessionId: string };
      setRoomCode(payload.roomCode);
      setSessionId(payload.sessionId);
      addAudit(`Joined session ${payload.sessionId}. Waiting for host share.`);
      return;
    }

    if (message.type === "room.peer_joined") {
      addAudit("Peer joined. Verify identity before sharing or control.");
      const fp = await sessionFingerprint([sessionId, roomCode, dev.deviceId, JSON.stringify(message.payload)]);
      setFingerprint(fp);
      return;
    }

    if (message.type === "signal.offer") {
      const peer = createPeer(client, dev.deviceId, roomCode);
      peerRef.current = peer;
      const payload = message.payload as { description: RTCSessionDescriptionInit };
      const answer = await peer.acceptOffer(payload.description);
      client.sendSignal("signal.answer", roomCode, { description: answer }, dev.deviceId);
      addAudit("Received screen-share offer and sent answer.");
      return;
    }

    if (message.type === "signal.answer") {
      const payload = message.payload as { description: RTCSessionDescriptionInit };
      await peerRef.current?.acceptAnswer(payload.description);
      return;
    }

    if (message.type === "signal.ice") {
      const payload = message.payload as { candidate: RTCIceCandidateInit };
      if (payload.candidate) await peerRef.current?.addIceCandidate(payload.candidate);
      return;
    }

    if (message.type === "session.end") {
      addAudit("Peer ended or left the session.");
      peerRef.current?.stop();
      return;
    }

    if (message.type === "error") {
      addAudit(`Relay error: ${JSON.stringify(message.payload)}`);
    }
  }

  function createPeer(client: SignalingClient, deviceId: string, activeRoomCode: string): QevPeer {
    return new QevPeer({
      onLocalIce: (candidate) => client.sendSignal("signal.ice", activeRoomCode, { candidate: candidate.toJSON() }, deviceId),
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          setRemoteVisible(true);
        }
        addAudit("Remote screen stream attached.");
      },
      onAudit: addAudit,
    });
  }

  function addAudit(line: string): void {
    setAudit((previous) => [`${new Date().toLocaleTimeString()} — ${line}`, ...previous].slice(0, 30));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">QEV Workspace</p>
          <h1>Consent-first remote workspace for teams.</h1>
          <p className="subcopy">
            Share a screen, verify the peer, and keep the session visible. Remote control is intentionally held back until the native agent consent model is hardened.
          </p>
        </div>
        <div className="trust-card">
          <strong>Safety line</strong>
          <span>No silent access. No unattended control. No hidden monitoring.</span>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Session</h2>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            Relay URL
            <input value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
          </label>
          <div className="button-row">
            <button onClick={() => void createSession()}>Create session</button>
            <button onClick={() => void joinSession()} className="secondary">Join session</button>
          </div>
          <label>
            Session code
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="QEV-1234-ALPHA" />
          </label>
          <button onClick={() => void startShare()} disabled={!roomCode}>Share screen with browser prompt</button>
          <button onClick={endSession} className="danger">End session</button>
        </div>

        <div className="panel status-panel">
          <h2>Consent state</h2>
          <dl>
            <div><dt>Relay</dt><dd>{status}</dd></div>
            <div><dt>Session</dt><dd>{sessionId || "not created"}</dd></div>
            <div><dt>Device</dt><dd>{device?.deviceId || "not created"}</dd></div>
            <div><dt>Safety number</dt><dd>{fingerprint || "pending peer"}</dd></div>
          </dl>
          <div className="active-banner">Visible session indicator placeholder</div>
        </div>
      </section>

      <section className="panel video-panel">
        <h2>Remote screen</h2>
        {!remoteVisible && <p className="empty">No remote stream attached yet.</p>}
        <video ref={remoteVideoRef} autoPlay playsInline controls={false} />
      </section>

      <section className="panel">
        <h2>Audit</h2>
        <ul className="audit-list">
          {audit.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
        </ul>
      </section>
    </main>
  );
}
