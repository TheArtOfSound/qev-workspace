import type { EncryptedPayload, PointerPayload } from "@qev-workspace/protocol";

export type QevPeerDataMessage =
  | {
      type: "pointer.move";
      payload: PointerPayload;
    }
  | {
      type: "qev.encrypted";
      payload: EncryptedPayload;
    };

export type PeerCallbacks = {
  onLocalIce: (candidate: RTCIceCandidate) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onPointer: (payload: PointerPayload) => void;
  onEncryptedData?: (payload: EncryptedPayload) => void;
  onAudit: (message: string) => void;
};

export type LocalMediaOptions = {
  video: boolean;
  audio: boolean;
};

export class QevPeer {
  private pc: RTCPeerConnection;
  private localStreams: MediaStream[] = [];
  private dataChannel: RTCDataChannel | null = null;

  constructor(private readonly callbacks: PeerCallbacks) {
    this.pc = new RTCPeerConnection({
      iceServers: buildIceServers(),
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) callbacks.onLocalIce(event.candidate);
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) callbacks.onRemoteStream(stream);
    };

    this.pc.onconnectionstatechange = () => {
      callbacks.onAudit(`Peer connection state: ${this.pc.connectionState}`);
    };

    this.pc.oniceconnectionstatechange = () => {
      callbacks.onAudit(`ICE state: ${this.pc.iceConnectionState}`);
    };

    this.pc.ondatachannel = (event) => {
      this.attachDataChannel(event.channel);
    };
  }

  async startScreenShare(): Promise<RTCSessionDescriptionInit> {
    this.ensureDataChannel();

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
      },
      audio: false,
    });

    this.attachLocalStream(stream, "Screen sharing stopped by host/browser.");

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.callbacks.onAudit("Screen-share offer created.");
    return offer;
  }

  async startCameraCall(options: LocalMediaOptions = { video: true, audio: true }): Promise<RTCSessionDescriptionInit> {
    this.ensureDataChannel();

    const stream = await this.openCameraStream(options);
    this.attachLocalStream(stream, "Camera/microphone sharing stopped by host/browser.");

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.callbacks.onAudit("Camera/microphone call offer created.");
    return offer;
  }

  async acceptOffer(
    description: RTCSessionDescriptionInit,
    options: Partial<LocalMediaOptions> = {},
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(description);

    if (options.video || options.audio) {
      const stream = await this.openCameraStream({
        video: Boolean(options.video),
        audio: Boolean(options.audio),
      });
      this.attachLocalStream(stream, "Camera/microphone sharing stopped by peer/browser.");
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.callbacks.onAudit(options.video || options.audio ? "Offer accepted with local media." : "Offer accepted view-only.");
    return answer;
  }

  async acceptAnswer(description: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(description);
    this.callbacks.onAudit("Peer answer accepted.");
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  sendPointer(payload: PointerPayload): void {
    this.sendData({ type: "pointer.move", payload });
  }

  sendEncrypted(payload: EncryptedPayload): void {
    this.sendData({ type: "qev.encrypted", payload });
  }

  stop(): void {
    for (const stream of this.localStreams) {
      stream.getTracks().forEach((track) => track.stop());
    }

    this.localStreams = [];
    this.dataChannel?.close();
    this.pc.close();
    this.callbacks.onAudit("Peer connection closed.");
  }

  private ensureDataChannel(): RTCDataChannel {
    if (this.dataChannel && this.dataChannel.readyState !== "closed") return this.dataChannel;

    this.dataChannel = this.pc.createDataChannel("qev-private-data", {
      ordered: true,
    });
    this.attachDataChannel(this.dataChannel);
    return this.dataChannel;
  }

  private sendData(message: QevPeerDataMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;
    this.dataChannel.send(JSON.stringify(message));
  }

  private async openCameraStream(options: LocalMediaOptions): Promise<MediaStream> {
    if (!options.video && !options.audio) return new MediaStream();

    return navigator.mediaDevices.getUserMedia({
      video: options.video
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          }
        : false,
      audio: options.audio
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : false,
    });
  }

  private attachLocalStream(stream: MediaStream, endMessage: string): void {
    this.localStreams.push(stream);

    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
      track.addEventListener("ended", () => this.callbacks.onAudit(endMessage));
    }
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => this.callbacks.onAudit("QEV peer data channel opened.");
    channel.onclose = () => this.callbacks.onAudit("QEV peer data channel closed.");

    channel.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as QevPeerDataMessage;

        if (parsed.type === "pointer.move") {
          this.callbacks.onPointer(parsed.payload);
          return;
        }

        if (parsed.type === "qev.encrypted") {
          this.callbacks.onEncryptedData?.(parsed.payload);
          return;
        }
      } catch {
        this.callbacks.onAudit("Ignored malformed QEV peer data message.");
      }
    };
  }
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username,
      credential,
    });
  }

  return servers;
}
