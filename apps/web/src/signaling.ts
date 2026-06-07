import {
  createEnvelope,
  type DeviceIdentityPublic,
  type MessageType,
  type ProtocolEnvelope,
} from "@qev-workspace/protocol";

export type SignalingStatus = "idle" | "connecting" | "open" | "closed" | "error";

export class SignalingClient {
  private socket: WebSocket | null = null;

  onStatus?: (status: SignalingStatus) => void;
  onMessage?: (message: ProtocolEnvelope) => void;
  onAudit?: (message: string) => void;

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    this.onStatus?.("connecting");
    this.onAudit?.(`Connecting relay: ${this.url}`);

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      const timeout = window.setTimeout(() => {
        this.onStatus?.("error");
        reject(new Error("Relay connection timeout."));
      }, 10000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        this.onStatus?.("open");
        this.onAudit?.("Relay connected.");
        resolve();
      };

      socket.onerror = () => {
        window.clearTimeout(timeout);
        this.onStatus?.("error");
        this.onAudit?.("Relay connection error.");
        reject(new Error("Relay connection error."));
      };

      socket.onclose = () => {
        window.clearTimeout(timeout);
        this.onStatus?.("closed");
        this.onAudit?.("Relay closed.");
      };

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as ProtocolEnvelope;
          this.onMessage?.(parsed);
        } catch {
          this.onAudit?.("Ignored malformed relay message.");
        }
      };
    });
  }

  close(): void {
    this.socket?.close(1000, "client_closed");
    this.socket = null;
    this.onStatus?.("closed");
  }

  createRoom(device: DeviceIdentityPublic): void {
    this.send(createEnvelope("room.create", { device }, { senderDeviceId: device.deviceId }));
  }

  joinRoom(roomCode: string, device: DeviceIdentityPublic): void {
    this.send(createEnvelope("room.join", { roomCode, device }, { roomCode, senderDeviceId: device.deviceId }));
  }

  sendSignal(type: MessageType, roomCode: string, payload: unknown, senderDeviceId: string): void {
    this.send(createEnvelope(type, payload, { roomCode, senderDeviceId }));
  }

  endSession(roomCode: string, senderDeviceId: string): void {
    this.sendSignal("session.end", roomCode, { reason: "local_user_ended" }, senderDeviceId);
  }

  private send(message: ProtocolEnvelope): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Relay is not connected.");
    }
    this.socket.send(JSON.stringify(message));
  }
}
