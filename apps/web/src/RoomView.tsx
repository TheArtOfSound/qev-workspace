import { ChatBox } from "./ChatBox";
import { App as WorkspaceApp } from "./WorkspaceApp";
import "./rooms.css";

type RoomViewProps = {
  roomId: string;
  roomName?: string;
  onLeave: () => void;
};

export function RoomView({ roomId, roomName, onLeave }: RoomViewProps) {
  return (
    <div data-testid="room-view">
      <header className="active-room-bar">
        <div>
          <span>Active persistent room</span>
          <strong>{roomName || roomId}</strong>
          <code data-testid="active-room-id">{roomId}</code>
        </div>
        <button type="button" onClick={onLeave}>Leave room</button>
      </header>
      <ChatBox roomId={roomId} />
      <WorkspaceApp />
    </div>
  );
}
