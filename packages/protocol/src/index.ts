export type DeviceIdentityPublic = {
  deviceId: string;
  displayName: string;
  publicKeyJwk: JsonWebKey;
  createdAt: string;
};

export type EncryptedPayload = {
  alg: "ECDH-P256-AES-GCM";
  iv: string;
  ciphertext: string;
};

export type ControlScope = "pointer" | "keyboard";

export type ControlGrantPayload = {
  grantId: string;
  scopes: ControlScope[];
  expiresAt: string;
  grantedByDeviceId: string;
  grantedToDeviceId: string;
};

export type ControlIntentPlaintext =
  | {
      kind: "pointer.move";
      grantId: string;
      x: number;
      y: number;
      at: string;
    }
  | {
      kind: "pointer.click";
      grantId: string;
      x: number;
      y: number;
      button: "left";
      at: string;
    }
  | {
      kind: "keyboard.intent";
      grantId: string;
      key: string;
      code: string;
      at: string;
    };

export type MessageType =
  | "room.create"
  | "room.created"
  | "room.join"
  | "room.joined"
  | "room.peer_joined"
  | "room.peer_left"
  | "signal.offer"
  | "signal.answer"
  | "signal.ice"
  | "pointer.move"
  | "control.request"
  | "control.grant"
  | "control.revoke"
  | "control.intent"
  | "permission.request"
  | "permission.grant"
  | "permission.revoke"
  | "audit.event"
  | "session.end"
  | "heartbeat"
  | "error";

export type ProtocolEnvelope<T = unknown> = {
  id: string;
  type: MessageType;
  sentAt: string;
  roomCode?: string;
  senderDeviceId?: string;
  payload: T;
};

export type RoomCreatedPayload = {
  roomCode: string;
  sessionId: string;
  expiresAt: string;
};

export type RoomJoinedPayload = {
  roomCode: string;
  sessionId: string;
  peer?: DeviceIdentityPublic;
};

export type PeerJoinedPayload = {
  roomCode: string;
  sessionId: string;
  device?: DeviceIdentityPublic;
};

export type PointerPayload = {
  x: number;
  y: number;
  label: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEnvelope<T>(
  type: MessageType,
  payload: T,
  options: {
    roomCode?: string;
    senderDeviceId?: string;
  } = {},
): ProtocolEnvelope<T> {
  return {
    id: createId("msg"),
    type,
    sentAt: nowIso(),
    roomCode: options.roomCode,
    senderDeviceId: options.senderDeviceId,
    payload,
  };
}

export function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.type === "string" &&
    typeof record.sentAt === "string" &&
    "payload" in record
  );
}

export function createId(prefix: string): string {
  return `${prefix}_${randomHex(16)}`;
}

export function generateRoomCode(): string {
  const words = ["ALPHA", "BRAVO", "CIPHER", "DELTA", "ECHO", "FORT", "NOVA", "ORBIT", "VAULT"];
  const n = Math.floor(1000 + Math.random() * 9000);
  const word = words[Math.floor(Math.random() * words.length)] ?? "ALPHA";
  return `QEV-${n}-${word}`;
}

export function safetyNumber(sessionId: string, a: string, b: string): string {
  const joined = [sessionId, a, b].sort().join(":");
  let hash = 2166136261;

  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const value = Math.abs(hash >>> 0).toString().padStart(10, "0").slice(0, 9);
  return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6, 9)}`;
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(data);
  } else {
    for (let i = 0; i < data.length; i += 1) data[i] = Math.floor(Math.random() * 256);
  }

  return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}
