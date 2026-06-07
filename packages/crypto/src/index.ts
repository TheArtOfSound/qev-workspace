import type { DeviceIdentityPublic } from "@qev-workspace/protocol";
import { createId, nowIso } from "@qev-workspace/protocol";

export interface DeviceIdentity extends DeviceIdentityPublic {
  privateKeyHandle: string;
}

export interface QevVaultAdapter {
  createDeviceIdentity(displayName: string): Promise<DeviceIdentity>;
  loadDeviceIdentity(): Promise<DeviceIdentity | null>;
  sealSecret(label: string, bytes: Uint8Array): Promise<Uint8Array>;
  openSecret(label: string, sealed: Uint8Array): Promise<Uint8Array>;
}

export class InMemoryQevVaultAdapter implements QevVaultAdapter {
  private device: DeviceIdentity | null = null;
  private sealed = new Map<string, Uint8Array>();

  async createDeviceIdentity(displayName: string): Promise<DeviceIdentity> {
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );

    const publicKeyRaw = await crypto.subtle.exportKey("spki", key.publicKey);
    const publicKey = bytesToBase64(new Uint8Array(publicKeyRaw));

    this.device = {
      deviceId: createId("dev"),
      displayName,
      publicKey,
      privateKeyHandle: createId("key"),
      createdAt: nowIso(),
    };

    return this.device;
  }

  async loadDeviceIdentity(): Promise<DeviceIdentity | null> {
    return this.device;
  }

  async sealSecret(label: string, bytes: Uint8Array): Promise<Uint8Array> {
    // Development placeholder only. Production must call QEV's real sealed envelope implementation.
    this.sealed.set(label, bytes.slice());
    return bytes.slice();
  }

  async openSecret(label: string, sealed: Uint8Array): Promise<Uint8Array> {
    return this.sealed.get(label)?.slice() ?? sealed.slice();
  }
}

export async function sessionFingerprint(parts: string[]): Promise<string> {
  const encoded = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest).slice(0, 9);
  const groups = Array.from(bytes, (byte) => byte.toString(10).padStart(3, "0"));
  return `${groups[0]}-${groups[1]}-${groups[2]}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
