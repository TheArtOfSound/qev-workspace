import { useCallback, useEffect, useState } from "react";
import { ChatBox } from "./ChatBox";
import {
  buildInviteLink,
  createRoomInvite,
  leaveRoomApi,
  listRoomMembers,
  type RoomMember,
} from "./rooms";
import { VoiceChannel } from "./VoiceChannel";
import { Avatar } from "./ui";

type RoomViewProps = {
  roomId: string;
  roomName?: string;
  onLeave: () => void;
};

export function RoomView({ roomId, roomName, onLeave }: RoomViewProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refreshMembers = useCallback(async (): Promise<void> => {
    try {
      const next = await listRoomMembers(roomId);
      setMembers(next);
    } catch {
      // non-fatal
    }
  }, [roomId]);

  useEffect(() => {
    void refreshMembers();
    const timer = window.setInterval(() => void refreshMembers(), 8_000);
    return () => window.clearInterval(timer);
  }, [refreshMembers]);

  async function handleInvite(): Promise<void> {
    setBusy("invite");
    setError("");
    try {
      const invite = await createRoomInvite(roomId);
      const link = buildInviteLink(roomId, invite.token);
      setInviteLink(link);
      setInviteOpen(true);
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        // user can copy manually
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn't make invite.");
    } finally {
      setBusy("");
    }
  }

  async function handleCopyInvite(): Promise<void> {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Select the link and copy it.");
    }
  }

  async function handleLeave(): Promise<void> {
    setBusy("leave");
    setError("");
    try {
      await leaveRoomApi(roomId);
      onLeave();
    } catch (reason) {
      // Still leave local view so the user isn't stuck.
      onLeave();
      setError(reason instanceof Error ? reason.message : "Left locally.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div
      className="room-stage-root"
      data-testid="room-view"
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
    >
      <header className="room-top">
        <div className="room-top__title">
          <span className="hash">#</span>
          <h2>{roomName || "room"}</h2>
        </div>
        <div className="room-top__actions">
          <span data-testid="active-room-id" className="sr-only" aria-hidden="true">
            {roomId}
          </span>
          <button
            type="button"
            className="btn btn--muted"
            data-testid="invite-people-button"
            onClick={() => void handleInvite()}
            disabled={busy === "invite"}
          >
            {busy === "invite" ? "…" : copied ? "Invite copied" : "Invite"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            data-testid="people-button"
            onClick={() => setPeopleOpen((open) => !open)}
          >
            People{members.length ? ` (${members.length})` : ""}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            data-testid="leave-room-button"
            onClick={() => void handleLeave()}
            disabled={busy === "leave"}
          >
            Leave
          </button>
        </div>
      </header>

      {error ? (
        <p className="chat__error" role="alert" style={{ margin: "8px 16px 0" }}>
          {error}
        </p>
      ) : null}

      {inviteOpen && inviteLink ? (
        <div className="invite-bar" data-testid="invite-bar">
          <div>
            <strong>Invite link</strong>
            <p>Send this to someone. They log in and join automatically.</p>
            <code data-testid="invite-link">{inviteLink}</code>
          </div>
          <div className="invite-bar__actions">
            <button type="button" className="btn btn--muted" onClick={() => void handleCopyInvite()}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setInviteOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {peopleOpen ? (
        <div className="people-bar" data-testid="people-bar">
          <strong>In this room</strong>
          <ul>
            {members.length === 0 ? (
              <li className="people-bar__empty">Loading…</li>
            ) : (
              members.map((member) => (
                <li key={member.userId}>
                  <Avatar name={member.displayName} id={member.userId} />
                  <span>
                    {member.displayName}
                    {member.role === "owner" ? " · owner" : ""}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      <VoiceChannel roomId={roomId} autoJoin={false} compact />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ChatBox roomId={roomId} roomName={roomName} />
      </div>
    </div>
  );
}
