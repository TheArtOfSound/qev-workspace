import { createId, safetyNumber, type DeviceIdentityPublic } from "@qev-workspace/protocol";

export type DeviceIdentity = DeviceIdentityPublic & {
  privateKeyEnvelope: string;
};

const STORAGE_KEY = "qev.workspace.device.v1";

export class BrowserQevVaultAdapter {
  async loadDeviceIdentity(): Promise<DeviceIdentity | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DeviceIdentity;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async createDeviceIdentity(displayName: string): Promise<DeviceIdentity> {
    const identity: DeviceIdentity = {
      deviceId: createId("dev"),
      displayName,
      publicKey: createId("pub"),
      privateKeyEnvelope: `qev-envelope-placeholder:${createId("priv")}`,
      createdAt: new Date().toISOString(),
    };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    }
    return identity;
  }

  async resetDeviceIdentity(): Promise<void> {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  }
}

export function sessionFingerprint(sessionId: string, localDeviceId: string, peerDeviceId?: string): string {
  if (!peerDeviceId) return "pending peer";
  return safetyNumber(sessionId, localDeviceId, peerDeviceId);
}
