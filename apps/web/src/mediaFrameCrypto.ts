export type FrameCryptoStatus = {
  direction: "send" | "receive";
  state: "attached" | "unsupported" | "error";
  trackKind?: string;
  message: string;
};

type EncodedStreamsOwner = {
  createEncodedStreams?: () => {
    readable: ReadableStream<EncodedFrameLike>;
    writable: WritableStream<EncodedFrameLike>;
  };
};

type EncodedFrameLike = {
  data: ArrayBuffer;
  type?: string;
  timestamp?: number;
};

const MAGIC = new Uint8Array([0x51, 0x45, 0x56, 0x31]); // QEV1
const AAD = new TextEncoder().encode("qev-media-frame-v1");

export function canAttachLegacyFrameCrypto(owner: unknown): boolean {
  return typeof (owner as EncodedStreamsOwner | null)?.createEncodedStreams === "function";
}

export function attachFrameEncryptionToSender(
  sender: RTCRtpSender,
  key: CryptoKey,
  trackKind: string,
  onStatus?: (status: FrameCryptoStatus) => void,
): void {
  attachFrameCrypto(sender, key, "send", trackKind, onStatus);
}

export function attachFrameDecryptionToReceiver(
  receiver: RTCRtpReceiver,
  key: CryptoKey,
  trackKind: string,
  onStatus?: (status: FrameCryptoStatus) => void,
): void {
  attachFrameCrypto(receiver, key, "receive", trackKind, onStatus);
}

function attachFrameCrypto(
  owner: RTCRtpSender | RTCRtpReceiver,
  key: CryptoKey,
  direction: "send" | "receive",
  trackKind: string,
  onStatus?: (status: FrameCryptoStatus) => void,
): void {
  if (!canAttachLegacyFrameCrypto(owner)) {
    onStatus?.({
      direction,
      state: "unsupported",
      trackKind,
      message: `QEV frame ${direction} transform unsupported for ${trackKind}.`,
    });
    return;
  }

  try {
    const streams = (owner as EncodedStreamsOwner).createEncodedStreams!();
    const transform = new TransformStream<EncodedFrameLike, EncodedFrameLike>({
      async transform(frame, controller) {
        try {
          frame.data =
            direction === "send"
              ? await encryptFrame(key, frame.data)
              : await decryptFrame(key, frame.data);

          controller.enqueue(frame);
        } catch {
          // Privacy-first failure mode: drop frames instead of leaking plaintext or feeding encrypted garbage to decoder.
        }
      },
    });

    streams.readable
      .pipeThrough(transform)
      .pipeTo(streams.writable)
      .catch(() => {
        onStatus?.({
          direction,
          state: "error",
          trackKind,
          message: `QEV frame ${direction} transform pipeline failed for ${trackKind}.`,
        });
      });

    onStatus?.({
      direction,
      state: "attached",
      trackKind,
      message: `QEV frame ${direction} encryption attached for ${trackKind}.`,
    });
  } catch {
    onStatus?.({
      direction,
      state: "error",
      trackKind,
      message: `QEV frame ${direction} transform failed to attach for ${trackKind}.`,
    });
  }
}

async function encryptFrame(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: strictCopy(iv),
        additionalData: strictCopy(AAD),
      },
      key,
      data,
    ),
  );

  const out = new Uint8Array(MAGIC.length + iv.length + ciphertext.length);
  out.set(MAGIC, 0);
  out.set(iv, MAGIC.length);
  out.set(ciphertext, MAGIC.length + iv.length);
  return out.buffer;
}

async function decryptFrame(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const input = new Uint8Array(data);

  if (input.byteLength < MAGIC.length + 12 + 16) {
    throw new Error("qev_frame_too_small");
  }

  for (let i = 0; i < MAGIC.length; i += 1) {
    if (input[i] !== MAGIC[i]) throw new Error("qev_frame_magic_mismatch");
  }

  const iv = input.slice(MAGIC.length, MAGIC.length + 12);
  const ciphertext = input.slice(MAGIC.length + 12);

  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: strictCopy(iv),
      additionalData: strictCopy(AAD),
    },
    key,
    strictCopy(ciphertext),
  );
}

function strictCopy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
