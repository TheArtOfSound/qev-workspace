import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createRoom, getRooms, joinRoom } from "./rooms";
import type { Room } from "./types";

type RoomListProps = {
  onRoomJoined: (room: Room) => void;
  activeRoomId?: string;
};

export function RoomList({ onRoomJoined, activeRoomId = "" }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void getRooms()
      .then((next) => {
        if (!cancelled) setRooms(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(toMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const roomName = name.trim();
    if (!roomName || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const room = await createRoom(roomName);
      setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
      setName("");
      await joinRoom(room.id);
      onRoomJoined(room);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpen(room: Room): Promise<void> {
    if (busyId) return;
    if (room.id === activeRoomId) {
      onRoomJoined(room);
      return;
    }

    setBusyId(room.id);
    setError("");

    try {
      await joinRoom(room.id);
      onRoomJoined(room);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="channel-list-root" data-testid="room-list">
      <form className="sidebar__create" onSubmit={handleCreate}>
        <label htmlFor="room-name" className="sr-only">
          Room name
        </label>
        <input
          id="room-name"
          data-testid="room-name-input"
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          placeholder="New room name"
          maxLength={100}
          autoComplete="off"
        />
        <button data-testid="create-room-button" type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "…" : "Add"}
        </button>
      </form>

      {error ? (
        <p className="sidebar__error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="sidebar__label">Your rooms</p>

      <div className="sidebar__rooms">
        {loading ? (
          <p className="sidebar__empty">Loading…</p>
        ) : rooms.length === 0 ? (
          <p className="sidebar__empty" data-testid="rooms-empty">
            No rooms yet.
            <br />
            Type a name above and hit <strong>Add</strong>.
          </p>
        ) : (
          rooms.map((room) => {
            const isOn = room.id === activeRoomId;
            const busy = busyId === room.id;
            return (
              <button
                key={room.id}
                type="button"
                className={`room-btn${isOn ? " is-on" : ""}`}
                data-testid="room-card"
                onClick={() => void handleOpen(room)}
                disabled={Boolean(busyId) && !busy}
              >
                <span className="room-btn__hash">#</span>
                <span className="room-btn__name">{busy ? "Opening…" : room.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Couldn't do that. Try again.";
}
