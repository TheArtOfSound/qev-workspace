export interface Room {
  id: string;
  name: string;
  members: string[];
  createdBy?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id?: string;
  roomId?: string;
  senderUserId?: string;
  sender: string;
  timestamp: number;
  content: string;
  createdAt?: string;
  editedAt?: string | null;
}

export type AuthToken = string;

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

export interface JwtTokenPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
  jti?: string;
}
