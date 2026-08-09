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
};

type VoiceStatus = "requesting" | "waiting" | "connecting" | "connected" | "left" | "error";

export function VoiceChannel({ roomId }: VoiceChannelProps) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [active, setActive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>("requesting");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [localTrackCount, setLocalTrackCount] = useState(0);
  const [remoteTrackCount, setRemoteTrackCount] = useState(0);
  const [error, setError] = useState("");
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    if (!active) return;

    let disposed = false;
    let peer: RTCPeerConnection | null = null;

    // Deferring one task prevents React StrictMode's development-only effect replay
    // from opening two microphones and two signaling sockets for one component.
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

  function handleRejoin(): void {
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
      className="voice-channel"
      data-testid="voice-channel"
      data-connection-state={connectionState}
      aria-labelledby="voice-channel-title"
    >
      <div className="voice-channel__header">
        <div>
          <p className="eyebrow">Room voice</p>
          <h2 id="voice-channel-title">Voice channel</h2>
          <p className="voice-channel__limit" data-testid="voice-participant-limit">
            Direct peer-to-peer voice is limited to 2 participants.
          </p>
          <p data-testid="voice-status" className={`voice-channel__status voice-channel__status--${status}`}>
            {statusLabel(status, muted)}
          </p>
        </div>

        <div className="voice-channel__actions">
          {active ? (
            <>
              <button
                data-testid="voice-mute-button"
                type="button"
                onClick={handleMuteToggle}
                disabled={!peerRef.current || status === "requesting" || status === "error"}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button data-testid="voice-leave-button" type="button" onClick={handleLeave}>
                Leave voice
              </button>
            </>
          ) : (
            <button data-testid="voice-rejoin-button" type="button" onClick={handleRejoin}>
              Rejoin voice
            </button>
          )}
        </div>
      </div>

      {error ? <p className="persistent-rooms__error" role="alert">{error}</p> : null}
      {playbackBlocked ? (
        <button className="voice-channel__playback" type="button" onClick={handleEnablePlayback}>
          Enable incoming audio
        </button>
      ) : null}

      <audio data-testid="remote-audio" ref={remoteAudioRef} autoPlay playsInline />
      <div className="voice-channel__diagnostics" aria-hidden="true">
        <span data-testid="local-audio-track-count">{localTrackCount}</span>
        <span data-testid="remote-audio-track-count">{remoteTrackCount}</span>
      </div>
    </section>
  );
}

function statusLabel(status: VoiceStatus, muted: boolean): string {
  switch (status) {
    case "requesting":
      return "Requesting microphone access…";
    case "waiting":
      return muted ? "Microphone muted · waiting for another participant" : "Microphone live · waiting for another participant";
    case "connecting":
      return muted ? "Microphone muted · connecting…" : "Microphone live · connecting…";
    case "connected":
      return muted ? "Connected · microphone muted" : "Connected · microphone live";
    case "left":
      return "You left the voice channel.";
    case "error":
      return "Voice unavailable.";
  }
}

function toMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Microphone permission was denied. Allow microphone access to join voice.";
  }
  return reason instanceof Error ? reason.message : "Voice communication failed.";
}
