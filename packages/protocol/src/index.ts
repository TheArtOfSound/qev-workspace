export type ISODateString = string;

export type ProtocolMessageType =
  | "room.create"
  | "room.created"
  | "room.join"
  | "room.joined"
  | "room.peer_joined"
  | "signal.offer"
  | "signal.answer"
  | "signal.ice"
  | "permission.request"
  | "permission.grant"
  | "permission.revoke"
  | "permission.expired"
  | "audit.event"
  | "session.end"
  | "error";

export type PermissionName =
  | "can_view_screen"
  | "can_control_mouse"
  | "can_control_keyboard"
  | "can_offer_clipboard"
  | "can_offer_file";

export interface DeviceIdentityPublic {
  deviceId: string;
  displayName: string;
  publicKey: string;
  createdAt: ISODateString;
}

export interface PermissionGrant {
  sessionId: string;
  issuerDeviceId: string;
  holderDeviceId: string;
  permission: PermissionName;
  permissionEpoch: number;
  grantedAt: ISODateString;
  expiresAt: ISODateString;
  revokedAt?: ISODateString;
}

export interface ProtocolEnvelope<TPayload = unknown> {
  type: ProtocolMessageType;
  sessionId?: string;
  roomCode?: string;
  senderDeviceId?: string;
  counter?: number;
  sentAt: ISODateString;
  payload: TPayload;
}

export interface RoomCreatedPayload {
  roomCode: string;
  sessionId: string;
  expiresAt: ISODateString;
}

export interface JoinRoomPayload {
  roomCode: string;
  device: DeviceIdentityPublic;
}

export interface SignalPayload {
  roomCode: string;
  targetDeviceId?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface AuditEvent {
  eventId: string;
  sessionId: string;
  type:
    | "audit.session_created"
    | "audit.peer_joined"
    | "audit.screen_share_started"
    | "audit.screen_share_stopped"
    | "audit.control_requested"
    | "audit.control_granted"
    | "audit.control_revoked"
    | "audit.session_ended";
  actorDeviceId?: string;
  peerDeviceId?: string;
  timestamp: ISODateString;
  metadata?: Record<string, unknown>;
}

export function nowIso(): ISODateString {
  return new Date().toISOString();
}

export function createEnvelope<TPayload>(
  type: ProtocolMessageType,
  payload: TPayload,
  extra: Omit<Partial<ProtocolEnvelope<TPayload>>, "type" | "payload" | "sentAt"> = {},
): ProtocolEnvelope<TPayload> {
  return {
    type,
    payload,
    sentAt: nowIso(),
    ...extra,
  };
}

export function isProtocolEnvelope(value: unknown): value is ProtocolEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProtocolEnvelope>;
  return typeof candidate.type === "string" && typeof candidate.sentAt === "string" && "payload" in candidate;
}

export function generateRoomCode(): string {
  const number = Math.floor(1000 + Math.random() * 9000);
  const words = ["ALPHA", "BRAVO", "CIPHER", "DELTA", "ECHO", "VAULT"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `QEV-${number}-${word}`;
}

export function createId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${body}`;
}
