import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  BrowserQevVaultAdapter,
  decryptJson,
  derivePeerSessionKey,
  encryptJson,
  sessionFingerprint,
  type DeviceIdentity,
} from "@qev-workspace/crypto";
import {
  createId,
  type ControlGrantPayload,
  type ControlIntentPlaintext,
  type DeviceIdentityPublic,
  type EncryptedPayload,
  type PointerPayload,
  type ProtocolEnvelope,
} from "@qev-workspace/protocol";
import { SignalingClient, type SignalingStatus } from "./signaling";
import { QevPeer } from "./webrtc";
import { detectMediaPrivacyCapability, type MediaPrivacyCapability } from "./mediaPrivacy";
import { buildAgentCommand, buildAgentLaunchUrl, createPointerGrant, isGrantActive, type ControlGrant } from "./control";

const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";
const LOCAL_AGENT_URL = "http://127.0.0.1:39483";
const TRUSTED_PEERS_STORAGE_KEY = "qev.workspace.trustedPeers.v1";

type SessionStatus = "none" | "created" | "joined" | "peer-connected" | "sharing" | "viewing" | "ended";

type PrivateChatPayload = {
  kind: "qev.chat.v1";
  id: string;
  body: string;
  sender: string;
  sentAt: string;
  roomLockHash?: string | null;
};

type PrivateProofPayload = {
  kind: "qev.private-proof.v1";
  proofId: string;
  mode: "ping" | "pong";
  senderDeviceId: string;
  senderName: string;
  roomCode: string;
  sessionId: string;
  roomLockHash?: string | null;
  sentAt: string;
};

type ChatEntry = PrivateChatPayload & {
  direction: "me" | "peer" | "system";
  encrypted: boolean;
};

type TrustedPeerRecord = {
  deviceId: string;
  displayName: string;
  publicKeyFingerprint: string;
  trustedAt: string;
  lastSeenAt: string;
};

type QevEncryptedExportFile = {
  version: "qev-encrypted-transcript-v1";
  alg: "PBKDF2-SHA256-AES-GCM";
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  iv: string;
  ciphertext: string;
  exportedAt: string;
};

type WorkspaceSection = "workspace" | "setup" | "security" | "controls" | "logs";
type ThemeMode = "system" | "light" | "dark";

export function App() {
  const vault = useMemo(() => {
    const storedVault = localStorage.getItem(TRUSTED_PEERS_STORAGE_KEY);
    if (storedVault) {
      return JSON.parse(storedVault);
    }
    return {};
  }, []);

  useEffect(() => {
    // Introduce boundary around App.tsx
    const signalingClient = new SignalingClient(DEFAULT_RELAY_URL);
    signalingClient.connect().catch((error) => {
      console.error("Signaling client error:", error);
    });
  }, []);

  // ... rest of the code remains the same ...
}
