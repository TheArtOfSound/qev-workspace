import { authorizationHeader, getStoredToken, refreshAccessToken } from "./auth";
import { getRelayHttpBaseUrl } from "./rooms";

type AudioSignalMessage = {
  type: string;
  roomId?: string;
  participantCount?: number;
  maxParticipants?: number;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  ticket?: string;
  code?: string;
};

type AudioPeerState = {
  roomId: string;
  socket: WebSocket;
  localStream: MediaStream;
  remoteStream: MediaStream;
  pendingIceCandidates: RTCIceCandidateInit[];
  closed: boolean;
};

const AUDIO_JOIN_TIMEOUT_MS = 10_000;
const audioPeerStates = new WeakMap<RTCPeerConnection, AudioPeerState>();

export async function createAudioPeer(roomId: string): Promise<RTCPeerConnection> {
  const normalizedRoomId = roomId.trim();
  if (!normalizedRoomId) throw new Error("A room id is required to join voice.");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not supported in this browser.");
  if (typeof RTCPeerConnection === "undefined") throw new Error("WebRTC is not supported in this browser.");

  const ticket = await fetchVoiceTicket(normalizedRoomId);
  const iceServers = await fetchIceServers();

  const localStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const peer = new RTCPeerConnection({ iceServers });
  const remoteStream = new MediaStream();
  const socket = new WebSocket(buildAudioSignalUrl());
  const state: AudioPeerState = {
    roomId: normalizedRoomId,
    socket,
    localStream,
    remoteStream,
    pendingIceCandidates: [],
    closed: false,
  };

  audioPeerStates.set(peer, state);

  for (const track of localStream.getAudioTracks()) {
    peer.addTrack(track, localStream);
  }

  peer.ontrack = (event) => {
    const sourceStream = event.streams[0];
    const tracks = sourceStream?.getAudioTracks() ?? (event.track.kind === "audio" ? [event.track] : []);

    for (const track of tracks) {
      if (!remoteStream.getTracks().some((candidate) => candidate.id === track.id)) remoteStream.addTrack(track);
    }

    peer.dispatchEvent(new CustomEvent("qev-audio-track", { detail: { stream: remoteStream } }));
  };

  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    sendAudioSignal(state, {
      type: "audio.ice",
      roomId: normalizedRoomId,
      candidate: event.candidate.toJSON(),
    });
  };

  const joined = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out joining the room voice channel."));
    }, AUDIO_JOIN_TIMEOUT_MS);

    const resolveOnce = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };

    const rejectOnce = (reason: Error): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(reason);
    };

    socket.onopen = () => {
      sendAudioSignal(state, {
        type: "audio.join",
        roomId: normalizedRoomId,
        ticket,
      });
    };

    socket.onmessage = (event) => {
      let message: AudioSignalMessage;

      try {
        message = JSON.parse(String(event.data)) as AudioSignalMessage;
      } catch {
        peer.dispatchEvent(new CustomEvent("qev-audio-error", { detail: { message: "Malformed audio signal." } }));
        return;
      }

      if (message.type === "audio.joined") resolveOnce();
      if (message.type === "audio.error" && !settled) {
        rejectOnce(new Error(formatAudioError(message.code)));
        return;
      }

      void handleAudioSignal(peer, state, message).catch((reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error("Audio negotiation failed.");
        peer.dispatchEvent(new CustomEvent("qev-audio-error", { detail: { message: error.message } }));
        if (!settled) rejectOnce(error);
      });
    };

    socket.onerror = () => rejectOnce(new Error("The audio signaling connection failed."));

    socket.onclose = () => {
      if (!settled) rejectOnce(new Error("The audio signaling connection closed before joining."));
      if (!state.closed) {
        peer.dispatchEvent(new CustomEvent("qev-audio-error", { detail: { message: "Audio signaling disconnected." } }));
      }
    };
  });

  try {
    await joined;
    return peer;
  } catch (reason) {
    closeAudioPeer(peer);
    throw reason;
  }
}

export function getAudioLocalStream(peer: RTCPeerConnection): MediaStream | null {
  return audioPeerStates.get(peer)?.localStream ?? null;
}

export function getAudioRemoteStream(peer: RTCPeerConnection): MediaStream | null {
  return audioPeerStates.get(peer)?.remoteStream ?? null;
}

export function closeAudioPeer(peer: RTCPeerConnection): void {
  const state = audioPeerStates.get(peer);

  if (!state) {
    peer.getSenders().forEach((sender) => sender.track?.stop());
    if (peer.signalingState !== "closed") peer.close();
    return;
  }

  if (state.closed) return;
  state.closed = true;

  sendAudioSignal(state, {
    type: "audio.leave",
    roomId: state.roomId,
  });

  state.localStream.getTracks().forEach((track) => track.stop());
  state.remoteStream.getTracks().forEach((track) => state.remoteStream.removeTrack(track));

  if (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING) {
    state.socket.close(1000, "voice_left");
  }

  if (peer.signalingState !== "closed") peer.close();
  audioPeerStates.delete(peer);
}

async function fetchVoiceTicket(roomId: string): Promise<string> {
  const response = await authorizedFetch("/api/voice/ticket", {
    method: "POST",
    body: JSON.stringify({ roomId }),
  });

  if (!response.ok) {
    const body = await safeJson(response);
    throw new Error(
      typeof body.error === "string"
        ? `Unable to join voice: ${body.error}`
        : "Unable to obtain a voice signaling ticket.",
    );
  }

  const payload = await response.json() as { ticket?: unknown };
  if (typeof payload.ticket !== "string" || !payload.ticket) {
    throw new Error("Voice ticket response was invalid.");
  }
  return payload.ticket;
}

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await authorizedFetch("/api/webrtc/ice", { method: "GET" });
    if (!response.ok) return buildAudioIceServers();
    const payload = await response.json() as { iceServers?: RTCIceServer[] };
    if (Array.isArray(payload.iceServers) && payload.iceServers.length > 0) {
      return payload.iceServers;
    }
  } catch {
    // Fall back to public STUN / optional Vite TURN env.
  }
  return buildAudioIceServers();
}

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body) headers.set("content-type", "application/json");
  for (const [key, value] of Object.entries(authorizationHeader())) headers.set(key, value);

  let response = await fetch(`${getRelayHttpBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401 && getStoredToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set("authorization", `Bearer ${refreshed}`);
      response = await fetch(`${getRelayHttpBaseUrl()}${path}`, {
        ...init,
        credentials: "include",
        headers,
      });
    }
  }

  return response;
}

async function safeJson(response: Response): Promise<{ error?: unknown }> {
  try {
    return await response.json() as { error?: unknown };
  } catch {
    return {};
  }
}

async function handleAudioSignal(
  peer: RTCPeerConnection,
  state: AudioPeerState,
  message: AudioSignalMessage,
): Promise<void> {
  if (state.closed || message.roomId !== state.roomId) return;

  switch (message.type) {
    case "audio.peer_joined": {
      peer.dispatchEvent(new CustomEvent("qev-audio-peer-joined"));
      if (peer.signalingState !== "stable") return;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendAudioSignal(state, {
        type: "audio.offer",
        roomId: state.roomId,
        description: toSessionDescriptionInit(peer.localDescription),
      });
      return;
    }

    case "audio.offer": {
      if (!message.description) throw new Error("Audio offer was missing its session description.");
      await peer.setRemoteDescription(message.description);
      await flushPendingIceCandidates(peer, state);

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      sendAudioSignal(state, {
        type: "audio.answer",
        roomId: state.roomId,
        description: toSessionDescriptionInit(peer.localDescription),
      });
      return;
    }

    case "audio.answer":
      if (!message.description) throw new Error("Audio answer was missing its session description.");
      await peer.setRemoteDescription(message.description);
      await flushPendingIceCandidates(peer, state);
      return;

    case "audio.ice":
      if (!message.candidate) return;
      if (!peer.remoteDescription) {
        state.pendingIceCandidates.push(message.candidate);
        return;
      }
      await peer.addIceCandidate(message.candidate);
      return;

    case "audio.peer_left":
      peer.dispatchEvent(new CustomEvent("qev-audio-peer-left"));
      return;

    case "audio.error":
      peer.dispatchEvent(
        new CustomEvent("qev-audio-error", {
          detail: { message: formatAudioError(message.code) },
        }),
      );
  }
}

async function flushPendingIceCandidates(peer: RTCPeerConnection, state: AudioPeerState): Promise<void> {
  const candidates = state.pendingIceCandidates.splice(0, state.pendingIceCandidates.length);
  for (const candidate of candidates) await peer.addIceCandidate(candidate);
}

function sendAudioSignal(state: AudioPeerState, message: AudioSignalMessage): void {
  if (state.socket.readyState !== WebSocket.OPEN) return;
  state.socket.send(JSON.stringify(message));
}

function toSessionDescriptionInit(description: RTCSessionDescription | null): RTCSessionDescriptionInit {
  if (!description) throw new Error("The local audio session description is unavailable.");
  return {
    type: description.type,
    sdp: description.sdp,
  };
}

function buildAudioSignalUrl(): string {
  const fallback = import.meta.env.DEV ? "ws://localhost:8787/ws" : "";
  const configured = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? fallback;
  if (!configured) throw new Error("Voice signaling URL is not configured. Set VITE_RELAY_URL.");

  const url = new URL(configured, window.location.href);

  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol === "http:") url.protocol = "ws:";

  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/ws/audio")) {
    url.pathname = path;
  } else if (path.endsWith("/ws")) {
    url.pathname = `${path}/audio`;
  } else {
    url.pathname = `${path}/ws/audio`.replace(/\/+/g, "/");
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildAudioIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;

  // Static TURN credentials in the Vite bundle are discouraged. Prefer /api/webrtc/ice.
  if (turnUrl && import.meta.env.DEV) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME as string | undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string | undefined,
    });
  }

  return servers;
}

function formatAudioError(code: string | undefined): string {
  switch (code) {
    case "room_not_found":
      return "This room no longer exists.";
    case "audio_room_full":
      return "This peer-to-peer voice channel already has two participants.";
    case "auth_required":
    case "auth_invalid":
    case "auth_expired":
    case "auth_reused":
    case "forbidden":
      return "You are not authorized to join this room's voice channel.";
    case "not_in_audio_room":
    case "audio_room_mismatch":
      return "The relay rejected the voice-room membership.";
    default:
      return code ? `Voice signaling failed: ${code}` : "Voice signaling failed.";
  }
}
