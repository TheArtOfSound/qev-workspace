export type PeerCallbacks = {
  onLocalIce: (candidate: RTCIceCandidate) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onAudit: (message: string) => void;
};

export class QevPeer {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;

  constructor(private readonly callbacks: PeerCallbacks) {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) callbacks.onLocalIce(event.candidate);
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) callbacks.onRemoteStream(stream);
    };
  }

  async startScreenShare(): Promise<RTCSessionDescriptionInit> {
    this.localStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
      track.addEventListener("ended", () => this.callbacks.onAudit("Screen sharing stopped by browser/host."));
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.callbacks.onAudit("Screen sharing started. Waiting for peer answer.");
    return offer;
  }

  async acceptOffer(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(description);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.callbacks.onAudit("Accepted screen-share offer.");
    return answer;
  }

  async acceptAnswer(description: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(description);
    this.callbacks.onAudit("Peer answer accepted. Session media path established.");
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(candidate);
  }

  stop(): void {
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.pc.close();
    this.callbacks.onAudit("Peer connection closed.");
  }
}
