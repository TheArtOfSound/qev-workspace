import { useEffect, useRef, useState } from "react";
import {
  closeAudioPeer,
  createAudioPeer,
  getAudioLocalStream,
  getAudioRemoteStream,
} from "./webrtc";

type VoiceChannelProps = {
  roomId: string;
  autoJoin?: boolean;
  compact?: boolean;
};

type VoiceStatus = "idle" | "requesting" | "waiting" | "connecting" | "connected" | "left" | "error";

export function VoiceChannel({ roomId, autoJoin = false }: VoiceChannelProps) {
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
          attachRemote(createdPeer);

          const onState = (): void => {
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
                setError("Call failed. Try joining again.");
                break;
              case "closed":
                if (!disposed) setStatus("left");
                break;
            }
          };

          const onTrack = (): void => attachRemote(createdPeer);
          const onPeerJoined = (): void => setStatus("connecting");
          const onPeerLeft = (): void => setStatus("waiting");
          const onError = (event: Event): void => {
            const message = (event as CustomEvent<{ message?: string }>).detail?.message;
            setStatus("error");
            setError(message ?? "Voice failed.");
          };

          createdPeer.addEventListener("connectionstatechange", onState);
          createdPeer.addEventListener("qev-audio-track", onTrack);
          createdPeer.addEventListener("qev-audio-peer-joined", onPeerJoined);
          createdPeer.addEventListener("qev-audio-peer-left", onPeerLeft);
          createdPeer.addEventListener("qev-audio-error", onError);
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
      clearRemote();
    };
  }, [active, roomId]);

  function attachRemote(peer: RTCPeerConnection): void {
    const audio = remoteAudioRef.current;
    const stream = getAudioRemoteStream(peer);
    if (!audio || !stream) return;
    setRemoteTrackCount(stream.getAudioTracks().length);
    if (audio.srcObject !== stream) audio.srcObject = stream;
    void audio.play()
      .then(() => setPlaybackBlocked(false))
      .catch(() => setPlaybackBlocked(true));
  }

  function clearRemote(): void {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.pause();
    audio.srcObject = null;
  }

  function handleMute(): void {
    const peer = peerRef.current;
    if (!peer) return;
    const next = !muted;
    getAudioLocalStream(peer)?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  }

  function handleLeave(): void {
    const peer = peerRef.current;
    if (peer) closeAudioPeer(peer);
    peerRef.current = null;
    clearRemote();
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

  const inCall = active && status !== "left" && status !== "idle";
  const live = status === "connected";
  const bad = status === "error";

  return (
    <div
      className="voice"
      data-testid="voice-channel"
      data-connection-state={connectionState}
    >
      <div className="voice__left">
        <span className={`voice__dot${live ? " is-live" : ""}${bad ? " is-bad" : ""}`} />
        <span className="voice__label">Voice</span>
        <span data-testid="voice-status" className="voice__hint">
          {statusLabel(status, muted)}
        </span>
        <span data-testid="voice-participant-limit" className="voice__hint">
          · up to 2 people
        </span>
      </div>

      <div className="voice__actions">
        {inCall ? (
          <>
            <button
              type="button"
              className="btn btn--muted"
              data-testid="voice-mute-button"
              onClick={handleMute}
              disabled={!peerRef.current || status === "requesting" || status === "error"}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              className="btn btn--danger"
              data-testid="voice-leave-button"
              onClick={handleLeave}
            >
              Leave
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--green"
            data-testid="voice-rejoin-button"
            onClick={handleJoin}
          >
            Join voice
          </button>
        )}
      </div>

      {error ? (
        <p className="voice__error" role="alert">
          {error}
        </p>
      ) : null}
      {playbackBlocked ? (
        <button
          type="button"
          className="btn btn--muted"
          onClick={() => {
            const audio = remoteAudioRef.current;
            if (!audio) return;
            void audio.play()
              .then(() => setPlaybackBlocked(false))
              .catch(() => setPlaybackBlocked(true));
          }}
        >
          Click to hear them
        </button>
      ) : null}

      <audio data-testid="remote-audio" ref={remoteAudioRef} autoPlay playsInline />
      <div className="voice__hide" aria-hidden>
        <span data-testid="local-audio-track-count">{localTrackCount}</span>
        <span data-testid="remote-audio-track-count">{remoteTrackCount}</span>
      </div>
    </div>
  );
}

function statusLabel(status: VoiceStatus, muted: boolean): string {
  switch (status) {
    case "idle":
    case "left":
      return "Not in a call";
    case "requesting":
      return "Asking for mic…";
    case "waiting":
      return muted ? "Muted · waiting" : "Waiting for someone";
    case "connecting":
      return "Connecting…";
    case "connected":
      return muted ? "Connected · muted" : "Connected";
    case "error":
      return "Not working";
  }
}

function toMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === "NotAllowedError") {
    return "Allow the microphone, then try again.";
  }
  return reason instanceof Error ? reason.message : "Voice failed.";
}
