import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createRoom, getRooms, joinRoom } from "./rooms";
import type { Room } from "./types";
import "./rooms.css";

type RoomListProps = {
  onRoomJoined: (room: Room) => void;
  activeRoomId?: string;
};

export function RoomList({ onRoomJoined, activeRoomId = "" }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void getRooms()
      .then((nextRooms) => {
        if (!cancelled) setRooms(nextRooms);
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
    const normalizedName = name.trim();
    if (!normalizedName || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const room = await createRoom(normalizedName);
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
    if (joiningRoomId || room.id === activeRoomId) {
      if (room.id === activeRoomId) onRoomJoined(room);
      return;
    }

    setJoiningRoomId(room.id);
    setError("");

    try {
      await joinRoom(room.id);
      onRoomJoined(room);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setJoiningRoomId("");
    }
  }

  return (
    <section className="channel-list" data-testid="room-list" aria-label="Your rooms">
      <div className="channel-list__header">
        <h2>Rooms</h2>
      </div>

      <form className="channel-list__create" onSubmit={handleCreate}>
        <label htmlFor="room-name" className="sr-only">
          New room name
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
        <button
          data-testid="create-room-button"
          type="submit"
          disabled={submitting || !name.trim()}
          title="Create room"
        >
          {submitting ? "…" : "+"}
        </button>
      </form>

      {error ? (
        <p className="channel-list__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="channel-list__scroll">
        {loading ? (
          <p className="channel-list__empty">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <p className="channel-list__empty" data-testid="rooms-empty">
            No rooms yet. Create one above.
          </p>
        ) : (
          <ul className="channel-list__items">
            {rooms.map((room) => {
              const isActive = room.id === activeRoomId;
              const isJoining = joiningRoomId === room.id;
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    className={`channel-item${isActive ? " is-active" : ""}`}
                    data-testid="room-card"
                    onClick={() => void handleOpen(room)}
                    disabled={Boolean(joiningRoomId) && !isJoining}
                  >
                    <span className="channel-item__hash">#</span>
                    <span className="channel-item__name">{room.name}</span>
                    <span className="channel-item__meta">
                      {isJoining ? "Opening…" : `${room.members.length}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The room operation failed.";
}
