import { ChatBox } from "./ChatBox";
import { VoiceChannel } from "./VoiceChannel";

type RoomViewProps = {
  roomId: string;
  roomName?: string;
  onLeave: () => void;
};

export function RoomView({ roomId, roomName, onLeave }: RoomViewProps) {
  return (
    <div className="room-stage-root" data-testid="room-view" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <header className="room-top">
        <div className="room-top__title">
          <span className="hash">#</span>
          <h2>{roomName || "room"}</h2>
        </div>
        <div className="room-top__actions">
          {/* Keep for tests; never show raw IDs in the product UI. */}
          <span data-testid="active-room-id" className="sr-only" aria-hidden="true">
            {roomId}
          </span>
          <button type="button" className="btn btn--ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <VoiceChannel roomId={roomId} autoJoin={false} compact />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ChatBox roomId={roomId} roomName={roomName} />
      </div>
    </div>
  );
}
