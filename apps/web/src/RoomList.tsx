import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { createRoom, getRooms, joinRoom } from "./rooms";
import type { Room } from "./types";
import "./rooms.css";

type RoomListProps = {
  onRoomJoined: (room: Room) => void;
};

export function RoomList({ onRoomJoined }: RoomListProps) {
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
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(room: Room): Promise<void> {
    if (joiningRoomId) return;

    setJoiningRoomId(room.id);
    setError("");

    try {
      await joinRoom(room.id);
      onRoomJoined(room);
    } catch (reason) {
      setError(toMessage(reason));
      setJoiningRoomId("");
    }
  }

  return (
    <section className="persistent-rooms" data-testid="room-list" aria-labelledby="persistent-rooms-title">
      <div className="persistent-rooms__header">
        <div>
          <p className="eyebrow">Persistent rooms</p>
          <h2 id="persistent-rooms-title">Choose a workspace room</h2>
          <p>Rooms remain available while the relay process is running. Your active room survives browser refreshes.</p>
        </div>

        <form className="persistent-rooms__form" onSubmit={handleCreate}>
          <label htmlFor="room-name">New room name</label>
          <div className="persistent-rooms__create-row">
            <input
              id="room-name"
              data-testid="room-name-input"
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              placeholder="Design review"
              maxLength={100}
              autoComplete="off"
            />
            <button data-testid="create-room-button" type="submit" disabled={submitting || !name.trim()}>
              {submitting ? "Creating…" : "Create room"}
            </button>
          </div>
        </form>
      </div>

      {error ? <p className="persistent-rooms__error" role="alert">{error}</p> : null}

      {loading ? (
        <p className="persistent-rooms__empty">Loading rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="persistent-rooms__empty">No persistent rooms yet. Create the first one.</p>
      ) : (
        <div className="persistent-rooms__grid">
          {rooms.map((room) => (
            <article className="persistent-room-card" data-testid="room-card" key={room.id}>
              <div>
                <h3>{room.name}</h3>
                <p>{room.members.length} {room.members.length === 1 ? "member" : "members"}</p>
                <code>{room.id}</code>
              </div>
              <button type="button" onClick={() => void handleJoin(room)} disabled={Boolean(joiningRoomId)}>
                {joiningRoomId === room.id ? "Joining…" : "Join"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The room operation failed.";
}
