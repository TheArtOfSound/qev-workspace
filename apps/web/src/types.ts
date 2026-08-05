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
