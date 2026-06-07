import {
  createId,
  safetyNumber,
  type DeviceIdentityPublic,
  type EncryptedPayload,
} from "@qev-workspace/protocol";

export type DeviceIdentity = DeviceIdentityPublic & {
  privateKeyJwk: JsonWebKey;
  privateKeyEnvelope: string;
};

const STORAGE_KEY = "qev.workspace.device.v2";

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
    const pair = await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      true,
      ["deriveKey"],
    );

    const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

    const identity: DeviceIdentity = {
      deviceId: createId("dev"),
      displayName,
      publicKeyJwk,
      privateKeyJwk,
      privateKeyEnvelope: "qev-browser-local-envelope-v2",
      createdAt: new Date().toISOString(),
    };

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    }

    return identity;
  }

  async resetDeviceIdentity(): Promise<void> {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

export async function derivePeerSessionKey(
  local: DeviceIdentity,
  peer: DeviceIdentityPublic,
): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    local.privateKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    ["deriveKey"],
  );

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    peer.publicKeyJwk,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );

  return crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asStrictBufferSource(iv),
    },
    key,
    asStrictBufferSource(plaintext),
  );

  return {
    alg: "ECDH-P256-AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const iv = base64ToBytes(payload.iv);
  const ciphertext = base64ToBytes(payload.ciphertext);

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asStrictBufferSource(iv),
    },
    key,
    asStrictBufferSource(ciphertext),
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

export function sessionFingerprint(
  sessionId: string,
  localDeviceId: string,
  peerDeviceId?: string,
): string {
  if (!peerDeviceId) return "pending peer";
  return safetyNumber(sessionId, localDeviceId, peerDeviceId);
}

function asStrictBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
