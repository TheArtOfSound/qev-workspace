export interface Room {
  id: string;
  name: string;
  members: string[];
}

export interface ChatMessage {
  sender: string;
  timestamp: number;
  content: string;
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
}
