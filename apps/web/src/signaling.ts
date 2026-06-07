import { createEnvelope, type DeviceIdentityPublic, type ProtocolEnvelope } from "@qev-workspace/protocol";

export type SignalingStatus = "idle" | "connecting" | "connected" | "closed" | "error";

export class SignalingClient {
  private socket: WebSocket | null = null;
  private counter = 0;

  status: SignalingStatus = "idle";
  onMessage: (message: ProtocolEnvelope) => void = () => undefined;
  onStatus: (status: SignalingStatus) => void = () => undefined;

  constructor(private readonly url: string) {}

  connect(): void {
    this.status = "connecting";
    this.onStatus(this.status);
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("open", () => this.setStatus("connected"));
    this.socket.addEventListener("close", () => this.setStatus("closed"));
    this.socket.addEventListener("error", () => this.setStatus("error"));
    this.socket.addEventListener("message", (event) => {
      const parsed = JSON.parse(String(event.data)) as ProtocolEnvelope;
      this.onMessage(parsed);
    });
  }

  createRoom(device: DeviceIdentityPublic): void {
    this.send(createEnvelope("room.create", { device }, { senderDeviceId: device.deviceId, counter: this.nextCounter() }));
  }

  joinRoom(roomCode: string, device: DeviceIdentityPublic): void {
    this.send(createEnvelope("room.join", { roomCode, device }, { roomCode, senderDeviceId: device.deviceId, counter: this.nextCounter() }));
  }

  sendSignal(type: "signal.offer" | "signal.answer" | "signal.ice", roomCode: string, payload: unknown, senderDeviceId: string): void {
    this.send(createEnvelope(type, { roomCode, ...asRecord(payload) }, { roomCode, senderDeviceId, counter: this.nextCounter() }));
  }

  endSession(roomCode: string, senderDeviceId: string): void {
    this.send(createEnvelope("session.end", { roomCode }, { roomCode, senderDeviceId, counter: this.nextCounter() }));
  }

  close(): void {
    this.socket?.close(1000, "client_closed");
  }

  private send(message: ProtocolEnvelope): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error("signaling_socket_not_open");
    this.socket.send(JSON.stringify(message));
  }

  private nextCounter(): number {
    this.counter += 1;
    return this.counter;
  }

  private setStatus(status: SignalingStatus): void {
    this.status = status;
    this.onStatus(status);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
