import { ChatBox } from "./ChatBox";
import { VoiceChannel } from "./VoiceChannel";
import "./rooms.css";

type RoomViewProps = {
  roomId: string;
  roomName?: string;
  onLeave: () => void;
};

export function RoomView({ roomId, roomName, onLeave }: RoomViewProps) {
  return (
    <div className="room-stage" data-testid="room-view">
      <header className="room-stage__header">
        <div className="room-stage__title">
          <span className="room-stage__hash">#</span>
          <div>
            <h1>{roomName || "Room"}</h1>
            <p className="room-stage__sub">
              Chat with your team. Voice is optional and limited to 2 people.
            </p>
          </div>
        </div>
        <div className="room-stage__actions">
          <code className="room-stage__id" data-testid="active-room-id" title="Room ID">
            {roomId}
          </code>
          <button type="button" className="app-btn secondary" onClick={onLeave}>
            Leave room
          </button>
        </div>
      </header>

      <VoiceChannel roomId={roomId} autoJoin={false} compact />

      <div className="room-stage__chat">
        <ChatBox roomId={roomId} />
      </div>
    </div>
  );
}
