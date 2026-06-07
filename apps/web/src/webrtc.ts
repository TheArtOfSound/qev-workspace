import type { PointerPayload } from "@qev-workspace/protocol";

export type PeerCallbacks = {
  onLocalIce: (candidate: RTCIceCandidate) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onPointer: (payload: PointerPayload) => void;
  onAudit: (message: string) => void;
};

export class QevPeer {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
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
    this.dataChannel = this.pc.createDataChannel("qev-control-intents");
    this.attachDataChannel(this.dataChannel);

    this.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: 30,
      },
      audio: false,
    });

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
      track.addEventListener("ended", () => this.callbacks.onAudit("Screen sharing stopped by host/browser."));
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.callbacks.onAudit("Screen-share offer created.");
    return offer;
  }

  async acceptOffer(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(description);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.callbacks.onAudit("Screen-share offer accepted.");
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
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;
    this.dataChannel.send(JSON.stringify({ type: "pointer.move", payload }));
  }

  stop(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.dataChannel?.close();
    this.pc.close();
    this.callbacks.onAudit("Peer connection closed.");
  }

  private attachDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;

    channel.onopen = () => this.callbacks.onAudit("Peer data channel opened.");
    channel.onclose = () => this.callbacks.onAudit("Peer data channel closed.");

    channel.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as { type: string; payload: PointerPayload };
        if (parsed.type === "pointer.move") this.callbacks.onPointer(parsed.payload);
      } catch {
        this.callbacks.onAudit("Ignored malformed peer data message.");
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
