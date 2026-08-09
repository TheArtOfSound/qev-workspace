import { createId, getDb, nowIso, sha256 } from "../db/client.js";
import { hashPassword, verifyPassword } from "./password.js";

export type UserRecord = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  email_verified_at: string | null;
};

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
};

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
  };
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return getDb().get<UserRecord>("SELECT * FROM users WHERE email = ?", [normalizeEmail(email)]);
}

export function findUserById(id: string): UserRecord | undefined {
  return getDb().get<UserRecord>("SELECT * FROM users WHERE id = ?", [id]);
}

export function createUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): UserRecord {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("invalid_email");
  if (typeof input.password !== "string" || input.password.length < 8) throw new Error("weak_password");
  if (input.password.length > 200) throw new Error("weak_password");
  if (findUserByEmail(email)) throw new Error("email_taken");

  const now = nowIso();
  const user: UserRecord = {
    id: createId("usr"),
    email,
    display_name: deriveDisplayName(input.displayName, email),
    password_hash: hashPassword(input.password),
    created_at: now,
    updated_at: now,
    disabled_at: null,
    email_verified_at: null,
  };

  getDb().run(
    `INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at, disabled_at, email_verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id,
      user.email,
      user.display_name,
      user.password_hash,
      user.created_at,
      user.updated_at,
      user.disabled_at,
      user.email_verified_at,
    ],
  );

  return user;
}

export function authenticateUser(email: string, password: string): UserRecord | null {
  const user = findUserByEmail(email);
  if (!user || user.disabled_at) {
    // Constant-ish work to reduce timing oracles.
    hashPassword(typeof password === "string" ? password : "invalid-password");
    return null;
  }
  if (!verifyPassword(password, user.password_hash)) return null;
  return user;
}

export function createRefreshToken(input: {
  userId: string;
  familyId?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  ttlSeconds: number;
}): { rawToken: string; id: string; familyId: string; expiresAt: string } {
  const rawToken = createId("rt") + createId("sec");
  const id = createId("rtr");
  const familyId = input.familyId ?? createId("rtf");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();

  getDb().run(
    `INSERT INTO refresh_tokens
      (id, user_id, token_hash, family_id, created_at, expires_at, revoked_at, replaced_by, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [
      id,
      input.userId,
      sha256(rawToken),
      familyId,
      createdAt,
      expiresAt,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    ],
  );

  return { rawToken, id, familyId, expiresAt };
}

export function rotateRefreshToken(input: {
  rawToken: string;
  ttlSeconds: number;
  userAgent?: string | null;
  ipAddress?: string | null;
}): { user: UserRecord; rawToken: string; familyId: string } | null {
  const db = getDb();
  const tokenHash = sha256(input.rawToken);
  const existing = db.get<{
    id: string;
    user_id: string;
    family_id: string;
    expires_at: string;
    revoked_at: string | null;
  }>("SELECT * FROM refresh_tokens WHERE token_hash = ?", [tokenHash]);

  if (!existing) return null;

  if (existing.revoked_at) {
    // Reuse detection: revoke the whole family.
    db.run(
      "UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, ?) WHERE family_id = ? AND revoked_at IS NULL",
      [nowIso(), existing.family_id],
    );
    return null;
  }

  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    db.run("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?", [nowIso(), existing.id]);
    return null;
  }

  const user = findUserById(existing.user_id);
  if (!user || user.disabled_at) return null;

  const next = createRefreshToken({
    userId: user.id,
    familyId: existing.family_id,
    ttlSeconds: input.ttlSeconds,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  db.run(
    "UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?",
    [nowIso(), next.id, existing.id],
  );

  return { user, rawToken: next.rawToken, familyId: next.familyId };
}

export function revokeRefreshToken(rawToken: string): void {
  getDb().run(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    [nowIso(), sha256(rawToken)],
  );
}

export function revokeAllRefreshTokensForUser(userId: string): void {
  getDb().run(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    [nowIso(), userId],
  );
}

function deriveDisplayName(displayName: string | undefined, email: string): string {
  const provided = displayName?.trim();
  if (provided) return provided.slice(0, 80);

  const localPart = email.split("@")[0] ?? "QEV user";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
    .slice(0, 80) || "QEV user";
}
