import { createId, getDb, nowIso } from "../db/client.js";
import { requireMembership } from "../rooms/store.js";

export type MessageView = {
  id: string;
  roomId: string;
  senderUserId: string;
  sender: string;
  content: string;
  timestamp: number;
  createdAt: string;
  editedAt: string | null;
};

const MAX_CONTENT_LENGTH = 2_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export function createMessage(input: {
  roomId: string;
  senderUserId: string;
  content: string;
}): MessageView {
  if (!requireMembership(input.roomId, input.senderUserId)) {
    throw new Error("forbidden");
  }

  const content = input.content.trim();
  if (!content) throw new Error("message_content_required");
  if (content.length > MAX_CONTENT_LENGTH) throw new Error("message_too_long");

  const id = createId("msg");
  const createdAt = nowIso();
  getDb().run(
    `INSERT INTO messages (id, room_id, sender_user_id, content, created_at, edited_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    [id, input.roomId, input.senderUserId, content, createdAt],
  );
  getDb().run("UPDATE rooms SET updated_at = ? WHERE id = ?", [createdAt, input.roomId]);

  const message = getMessageById(id);
  if (!message) throw new Error("message_create_failed");
  return message;
}

export function listMessages(input: {
  roomId: string;
  userId: string;
  before?: string | null;
  limit?: number;
}): MessageView[] {
  if (!requireMembership(input.roomId, input.userId)) {
    throw new Error("forbidden");
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  let rows: Array<Record<string, unknown>>;

  if (input.before) {
    const cursor = getDb().get<{ created_at: string; id: string }>(
      "SELECT created_at, id FROM messages WHERE id = ? AND room_id = ?",
      [input.before, input.roomId],
    );
    if (!cursor) return [];

    rows = getDb().all(
      `SELECT m.id, m.room_id, m.sender_user_id, m.content, m.created_at, m.edited_at, u.display_name
       FROM messages m
       INNER JOIN users u ON u.id = m.sender_user_id
       WHERE m.room_id = ?
         AND m.deleted_at IS NULL
         AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`,
      [input.roomId, cursor.created_at, cursor.created_at, cursor.id, limit],
    );
  } else {
    rows = getDb().all(
      `SELECT m.id, m.room_id, m.sender_user_id, m.content, m.created_at, m.edited_at, u.display_name
       FROM messages m
       INNER JOIN users u ON u.id = m.sender_user_id
       WHERE m.room_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`,
      [input.roomId, limit],
    );
  }

  return rows
    .map(mapMessage)
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });
}

function getMessageById(id: string): MessageView | null {
  const row = getDb().get(
    `SELECT m.id, m.room_id, m.sender_user_id, m.content, m.created_at, m.edited_at, u.display_name
     FROM messages m
     INNER JOIN users u ON u.id = m.sender_user_id
     WHERE m.id = ?`,
    [id],
  );
  return row ? mapMessage(row) : null;
}

function mapMessage(row: Record<string, unknown>): MessageView {
  const createdAt = String(row.created_at);
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    senderUserId: String(row.sender_user_id),
    sender: String(row.display_name),
    content: String(row.content),
    timestamp: new Date(createdAt).getTime(),
    createdAt,
    editedAt: row.edited_at ? String(row.edited_at) : null,
  };
}
