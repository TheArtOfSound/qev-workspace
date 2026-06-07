import { createId } from "@qev-workspace/protocol";

export type ControlGrant = {
  grantId: string;
  roomCode: string;
  relayUrl: string;
  hostName: string;
  expiresAt: string;
  scopes: Array<"pointer" | "keyboard">;
};

export function createPointerGrant(args: {
  roomCode: string;
  relayUrl: string;
  hostName: string;
  minutes?: number;
}): ControlGrant {
  const minutes = args.minutes ?? 5;

  return {
    grantId: createId("grant"),
    roomCode: args.roomCode,
    relayUrl: args.relayUrl,
    hostName: args.hostName,
    expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    scopes: ["pointer"],
  };
}

export function isGrantActive(grant: ControlGrant | null): boolean {
  if (!grant) return false;
  return new Date(grant.expiresAt).getTime() > Date.now();
}

export function buildAgentLaunchUrl(grant: ControlGrant): string {
  const params = new URLSearchParams({
    room: grant.roomCode,
    relay: grant.relayUrl,
    grant: grant.grantId,
    host: grant.hostName,
    expires: grant.expiresAt,
    scopes: grant.scopes.join(","),
  });

  return `qevworkspace://control?${params.toString()}`;
}

export function buildAgentCommand(grant: ControlGrant): string {
  return [
    "cd ~/Downloads/qev-workspace",
    `QEV_RELAY_URL=${quote(grant.relayUrl)}`,
    `QEV_ROOM_CODE=${quote(grant.roomCode)}`,
    `QEV_DISPLAY_NAME=${quote(grant.hostName)}`,
    `QEV_GRANT_ID=${quote(grant.grantId)}`,
    `QEV_GRANT_EXPIRES_AT=${quote(grant.expiresAt)}`,
    "pnpm run dev:host-agent",
  ].join(" \\\n  ");
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
