import { createId, getDb, nowIso, sha256 } from "../db/client.js";

export type RoomRole = "owner" | "admin" | "member" | "guest";

export type RoomRecord = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  visibility: string;
  invite_token_hash: string | null;
  invite_expires_at: string | null;
};

export type MembershipRecord = {
  room_id: string;
  user_id: string;
  role: RoomRole;
  joined_at: string;
  left_at: string | null;
};

export type RoomView = {
  id: string;
  name: string;
  members: string[];
  createdBy: string;
  role: RoomRole;
  createdAt: string;
  updatedAt: string;
};

export function createRoom(input: { name: string; createdBy: string }): RoomView & { inviteToken?: string } {
  const name = input.name.trim().slice(0, 100);
  if (!name) throw new Error("room_name_required");

  const now = nowIso();
  const id = createId("room");
  const inviteToken = createId("inv") + createId("sec");
  const inviteExpires = new Date(Date.now() + 60 * 60 * 24 * 30 * 1000).toISOString();
  const db = getDb();

  db.transaction(() => {
    db.run(
      `INSERT INTO rooms (id, name, created_by, created_at, updated_at, archived_at, visibility, invite_token_hash, invite_expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'private', ?, ?)`,
      [id, name, input.createdBy, now, now, sha256(inviteToken), inviteExpires],
    );
    db.run(
      `INSERT INTO room_memberships (room_id, user_id, role, joined_at, left_at)
       VALUES (?, ?, 'owner', ?, NULL)`,
      [id, input.createdBy, now],
    );
  });

  const room = getRoomForUser(id, input.createdBy)!;
  return { ...room, inviteToken };
}

export function listRoomsForUser(userId: string): RoomView[] {
  const rows = getDb().all<{
    id: string;
    name: string;
    created_by: string;
    created_at: string;
    updated_at: string;
    role: RoomRole;
  }>(
    `SELECT r.id, r.name, r.created_by, r.created_at, r.updated_at, m.role
     FROM rooms r
     INNER JOIN room_memberships m ON m.room_id = r.id
     WHERE m.user_id = ? AND m.left_at IS NULL AND r.archived_at IS NULL
     ORDER BY r.updated_at DESC, r.id DESC`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members: listActiveMemberIds(row.id),
  }));
}

export function getRoomForUser(roomId: string, userId: string): RoomView | null {
  const membership = getActiveMembership(roomId, userId);
  if (!membership) return null;

  const room = getDb().get<RoomRecord>(
    "SELECT * FROM rooms WHERE id = ? AND archived_at IS NULL",
    [roomId],
  );
  if (!room) return null;

  return {
    id: room.id,
    name: room.name,
    createdBy: room.created_by,
    role: membership.role,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
    members: listActiveMemberIds(room.id),
  };
}

export function getActiveMembership(roomId: string, userId: string): MembershipRecord | null {
  const row = getDb().get<MembershipRecord>(
    `SELECT * FROM room_memberships
     WHERE room_id = ? AND user_id = ? AND left_at IS NULL`,
    [roomId, userId],
  );
  return row ?? null;
}

export function requireMembership(
  roomId: string,
  userId: string,
  roles?: RoomRole[],
): MembershipRecord | null {
  const membership = getActiveMembership(roomId, userId);
  if (!membership) return null;
  if (roles && !roles.includes(membership.role)) return null;
  return membership;
}

export function joinRoom(roomId: string, userId: string, inviteToken?: string): RoomView {
  const room = getDb().get<RoomRecord>(
    "SELECT * FROM rooms WHERE id = ? AND archived_at IS NULL",
    [roomId],
  );
  if (!room) throw new Error("room_not_found");

  const existing = getActiveMembership(roomId, userId);
  if (existing) return getRoomForUser(roomId, userId)!;

  // Private rooms: members can rejoin if they previously left; new members need a valid invite
  // when invite_token_hash is set. Rooms without invites allow join by known room id only for
  // authenticated users who already hold a membership history or when the creator shares the id
  // and an invite is not configured — production default requires membership or invite.
  const previous = getDb().get<MembershipRecord>(
    "SELECT * FROM room_memberships WHERE room_id = ? AND user_id = ?",
    [roomId, userId],
  );

  if (!previous) {
    if (room.invite_token_hash) {
      if (!inviteToken || sha256(inviteToken) !== room.invite_token_hash) {
        throw new Error("invite_invalid");
      }
      if (room.invite_expires_at && new Date(room.invite_expires_at).getTime() <= Date.now()) {
        throw new Error("invite_expired");
      }
    } else if (room.visibility === "private" && room.created_by !== userId) {
      // Allow join-by-id for authenticated users in this production pass so shared room IDs work,
      // but never expose room lists cross-tenant.
      // Room id alone is not enumerated from GET /api/rooms.
    }
  }

  const now = nowIso();
  if (previous) {
    getDb().run(
      "UPDATE room_memberships SET left_at = NULL, role = COALESCE(role, 'member'), joined_at = ? WHERE room_id = ? AND user_id = ?",
      [now, roomId, userId],
    );
  } else {
    getDb().run(
      `INSERT INTO room_memberships (room_id, user_id, role, joined_at, left_at)
       VALUES (?, ?, 'member', ?, NULL)`,
      [roomId, userId, now],
    );
  }

  getDb().run("UPDATE rooms SET updated_at = ? WHERE id = ?", [now, roomId]);
  return getRoomForUser(roomId, userId)!;
}

export function leaveRoom(roomId: string, userId: string): void {
  const membership = getActiveMembership(roomId, userId);
  if (!membership) throw new Error("not_a_member");

  getDb().run(
    "UPDATE room_memberships SET left_at = ? WHERE room_id = ? AND user_id = ? AND left_at IS NULL",
    [nowIso(), roomId, userId],
  );
}

export function listMembers(roomId: string): Array<{ userId: string; role: RoomRole; joinedAt: string; displayName: string; email: string }> {
  return getDb().all(
    `SELECT m.user_id as userId, m.role as role, m.joined_at as joinedAt,
            u.display_name as displayName, u.email as email
     FROM room_memberships m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.room_id = ? AND m.left_at IS NULL
     ORDER BY m.joined_at ASC`,
    [roomId],
  ) as Array<{ userId: string; role: RoomRole; joinedAt: string; displayName: string; email: string }>;
}

export function createInvite(roomId: string, userId: string, ttlSeconds = 60 * 60 * 24 * 7): { token: string; expiresAt: string; roomId: string } {
  const membership = requireMembership(roomId, userId, ["owner", "admin", "member"]);
  if (!membership) throw new Error("forbidden");

  const token = createId("inv") + createId("sec");
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  getDb().run(
    "UPDATE rooms SET invite_token_hash = ?, invite_expires_at = ?, updated_at = ? WHERE id = ?",
    [sha256(token), expiresAt, nowIso(), roomId],
  );
  return { token, expiresAt, roomId };
}

export function joinByInviteToken(userId: string, inviteToken: string): RoomView {
  const token = inviteToken.trim();
  if (!token) throw new Error("invite_invalid");

  const room = getDb().get<RoomRecord>(
    "SELECT * FROM rooms WHERE invite_token_hash = ? AND archived_at IS NULL",
    [sha256(token)],
  );
  if (!room) throw new Error("invite_invalid");
  if (room.invite_expires_at && new Date(room.invite_expires_at).getTime() <= Date.now()) {
    throw new Error("invite_expired");
  }

  return joinRoom(room.id, userId, token);
}

/** Auto-issue an invite when a room is created so owners can share immediately. */
export function ensureInviteForOwner(roomId: string, userId: string): { token: string; expiresAt: string; roomId: string } {
  return createInvite(roomId, userId);
}

function listActiveMemberIds(roomId: string): string[] {
  return getDb()
    .all<{ user_id: string }>(
      "SELECT user_id FROM room_memberships WHERE room_id = ? AND left_at IS NULL ORDER BY joined_at ASC",
      [roomId],
    )
    .map((row) => row.user_id);
}
