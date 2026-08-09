import { useEffect, useRef, useState } from "react";
import {
  closeAudioPeer,
  createAudioPeer,
  getAudioLocalStream,
  getAudioRemoteStream,
} from "./webrtc";
import "./rooms.css";

type VoiceChannelProps = {
  roomId: string;
  /** When false, user must click Join voice (product default). */
  autoJoin?: boolean;
  compact?: boolean;
};

type VoiceStatus = "idle" | "requesting" | "waiting" | "connecting" | "connected" | "left" | "error";

export function VoiceChannel({ roomId, autoJoin = false, compact = false }: VoiceChannelProps) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(autoJoin);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>(autoJoin ? "requesting" : "idle");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [localTrackCount, setLocalTrackCount] = useState(0);
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const [error, setError] = useState("");
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let peer: RTCPeerConnection | null = null;

    const startTimer = window.setTimeout(() => {
      setStatus("requesting");
      setConnectionState("new");
      setLocalTrackCount(0);
      setRemoteTrackCount(0);
      setError("");

      void createAudioPeer(roomId)
        .then((createdPeer) => {
          if (disposed) {
            closeAudioPeer(createdPeer);
            return;
          }

          peer = createdPeer;
          peerRef.current = createdPeer;
          setStatus("waiting");
          setConnectionState(createdPeer.connectionState);
          setLocalTrackCount(getAudioLocalStream(createdPeer)?.getAudioTracks().length ?? 0);
          attachRemoteAudio(createdPeer);

          const handleConnectionState = (): void => {
            setConnectionState(createdPeer.connectionState);

            switch (createdPeer.connectionState) {
              case "connected":
                setStatus("connected");
                setError("");
                break;
              case "connecting":
              case "new":
                setStatus("connecting");
                break;
              case "disconnected":
                setStatus("waiting");
                break;
              case "failed":
                setStatus("error");
                setError("The peer-to-peer audio connection failed.");
                break;
              case "closed":
                if (!disposed) setStatus("left");
                break;
            }
          };

          const handleRemoteTrack = (): void => {
            attachRemoteAudio(createdPeer);
          };

          const handlePeerJoined = (): void => {
            setStatus("connecting");
          };

          const handlePeerLeft = (): void => {
            setStatus("waiting");
          };

          const handleAudioError = (event: Event): void => {
            const message = (event as CustomEvent<{ message?: string }>).detail?.message;
            setStatus("error");
            setError(message ?? "Voice communication failed.");
          };

          createdPeer.addEventListener("connectionstatechange", handleConnectionState);
          createdPeer.addEventListener("qev-audio-track", handleRemoteTrack);
          createdPeer.addEventListener("qev-audio-peer-joined", handlePeerJoined);
          createdPeer.addEventListener("qev-audio-peer-left", handlePeerLeft);
          createdPeer.addEventListener("qev-audio-error", handleAudioError);
        })
        .catch((reason: unknown) => {
          if (disposed) return;
          setStatus("error");
          setError(toMessage(reason));
        });
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      if (peer) closeAudioPeer(peer);
      if (peerRef.current === peer) peerRef.current = null;
      setConnectionState("closed");
      setLocalTrackCount(0);
      setRemoteTrackCount(0);
      clearRemoteAudio();
    };
  }, [active, roomId]);

  function attachRemoteAudio(peer: RTCPeerConnection): void {
    const audio = remoteAudioRef.current;
    const stream = getAudioRemoteStream(peer);
    if (!audio || !stream) return;

    setRemoteTrackCount(stream.getAudioTracks().length);
    if (audio.srcObject !== stream) audio.srcObject = stream;
    void audio.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => setPlaybackBlocked(true));
  }

  function clearRemoteAudio(): void {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
  }

  function handleMuteToggle(): void {
    const peer = peerRef.current;
    if (!peer) return;

    const nextMuted = !muted;
    const stream = getAudioLocalStream(peer);
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }

  function handleLeave(): void {
    const peer = peerRef.current;
    if (peer) closeAudioPeer(peer);
    peerRef.current = null;
    clearRemoteAudio();
    setActive(false);
    setMuted(false);
    setStatus("left");
    setConnectionState("closed");
    setLocalTrackCount(0);
    setRemoteTrackCount(0);
    setError("");
  }

  function handleJoin(): void {
    setMuted(false);
    setPlaybackBlocked(false);
    setActive(true);
  }

  function handleEnablePlayback(): void {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    void audio.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => setPlaybackBlocked(true));
  }

  return (
    <section
      className={`voice-bar${compact ? " voice-bar--compact" : ""}`}
      data-testid="voice-channel"
      data-connection-state={connectionState}
      aria-label="Voice"
    >
      <div className="voice-bar__info">
        <strong id="voice-channel-title">Voice</strong>
        <span data-testid="voice-participant-limit" className="voice-bar__limit">
          Max 2 people
        </span>
        <span data-testid="voice-status" className={`voice-bar__status voice-bar__status--${status}`}>
          {statusLabel(status, muted)}
        </span>
      </div>

      <div className="voice-bar__actions">
        {active && status !== "left" && status !== "idle" ? (
          <>
            <button
              data-testid="voice-mute-button"
              type="button"
              className="app-btn secondary"
              onClick={handleMuteToggle}
              disabled={!peerRef.current || status === "requesting" || status === "error"}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              data-testid="voice-leave-button"
              type="button"
              className="app-btn secondary"
              onClick={handleLeave}
            >
              Leave voice
            </button>
          </>
        ) : (
          <button
            data-testid="voice-rejoin-button"
            type="button"
            className="app-btn primary"
            onClick={handleJoin}
          >
            Join voice
          </button>
        )}
      </div>

      {error ? (
        <p className="voice-bar__error" role="alert">
          {error}
        </p>
      ) : null}
      {playbackBlocked ? (
        <button className="voice-bar__playback" type="button" onClick={handleEnablePlayback}>
          Enable incoming audio
        </button>
      ) : null}

      <audio data-testid="remote-audio" ref={remoteAudioRef} autoPlay playsInline />
      <div className="voice-bar__diagnostics" aria-hidden="true">
        <span data-testid="local-audio-track-count">{localTrackCount}</span>
        <span data-testid="remote-audio-track-count">{remoteTrackCount}</span>
      </div>
    </section>
  );
}

function statusLabel(status: VoiceStatus, muted: boolean): string {
  switch (status) {
    case "idle":
    case "left":
      return "Not in voice";
    case "requesting":
      return "Requesting mic…";
    case "waiting":
      return muted ? "Muted · waiting" : "In call · waiting for peer";
    case "connecting":
      return muted ? "Muted · connecting…" : "Connecting…";
    case "connected":
      return muted ? "Connected · muted" : "Connected";
    case "error":
      return "Voice unavailable";
  }
}

function toMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone permission was denied.";
  }
  return reason instanceof Error ? reason.message : "Voice communication failed.";
}
