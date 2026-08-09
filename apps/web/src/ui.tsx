/** Tiny shared UI helpers for the product shell. */

const AVATAR_COLORS = [
  "#5865f2",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#3ba55d",
  "#faa81a",
  "#00b0f4",
];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

export function Avatar({ name, id }: { name: string; id?: string }) {
  return (
    <span className="avatar" style={{ background: avatarColor(id || name) }} aria-hidden>
      {initials(name)}
    </span>
  );
}
