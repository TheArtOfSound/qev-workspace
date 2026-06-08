export type MediaPrivacyCapability = {
  secureContext: boolean;
  mediaDevices: boolean;
  webRtc: boolean;
  webRtcTransportEncryption: boolean;
  scriptTransform: boolean;
  legacyInsertableStreams: boolean;
  insertableStreams: boolean;
  qevFrameEncryption: "available-not-enabled" | "not-supported" | "blocked";
  status: "ready" | "transport-only" | "blocked";
  label: string;
  notes: string[];
};

type WebRtcGlobal = typeof globalThis & {
  RTCPeerConnection?: unknown;
  RTCRtpScriptTransform?: unknown;
  RTCRtpSender?: {
    prototype?: {
      createEncodedStreams?: unknown;
    };
  };
  RTCRtpReceiver?: {
    prototype?: {
      createEncodedStreams?: unknown;
    };
  };
};

export function detectMediaPrivacyCapability(): MediaPrivacyCapability {
  const g = globalThis as WebRtcGlobal;
  const nav = typeof navigator === "undefined" ? null : navigator;
  const mediaDevicesObject = nav?.mediaDevices as (MediaDevices & { getDisplayMedia?: unknown }) | undefined;

  const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
  const mediaDevices = Boolean(
    mediaDevicesObject &&
      typeof mediaDevicesObject.getUserMedia === "function" &&
      typeof mediaDevicesObject.getDisplayMedia === "function",
  );

  const webRtc = typeof g.RTCPeerConnection === "function";
  const scriptTransform = typeof g.RTCRtpScriptTransform === "function";
  const legacySenderStreams = typeof g.RTCRtpSender?.prototype?.createEncodedStreams === "function";
  const legacyReceiverStreams = typeof g.RTCRtpReceiver?.prototype?.createEncodedStreams === "function";
  const legacyInsertableStreams = legacySenderStreams && legacyReceiverStreams;
  const insertableStreams = scriptTransform || legacyInsertableStreams;

  if (!secureContext || !mediaDevices || !webRtc) {
    return {
      secureContext,
      mediaDevices,
      webRtc,
      webRtcTransportEncryption: webRtc,
      scriptTransform,
      legacyInsertableStreams,
      insertableStreams,
      qevFrameEncryption: "blocked",
      status: "blocked",
      label: "media blocked by browser context",
      notes: [
        secureContext ? "Secure context is available." : "Secure context is missing. Use HTTPS or localhost.",
        mediaDevices ? "Camera/screen APIs are available." : "Camera or screen-capture APIs are unavailable.",
        webRtc ? "WebRTC is available." : "WebRTC is unavailable.",
      ],
    };
  }

  if (insertableStreams) {
    return {
      secureContext,
      mediaDevices,
      webRtc,
      webRtcTransportEncryption: true,
      scriptTransform,
      legacyInsertableStreams,
      insertableStreams,
      qevFrameEncryption: "available-not-enabled",
      status: "ready",
      label: "QEV frame encryption capable / not enabled",
      notes: [
        "WebRTC media transport encryption is available.",
        "Browser exposes encoded-frame transform hooks.",
        "Next hardening step can bind QEV frame encryption to outgoing and incoming media.",
        "QEV app data already remains separate from media and is encrypted at the app layer.",
      ],
    };
  }

  return {
    secureContext,
    mediaDevices,
    webRtc,
    webRtcTransportEncryption: true,
    scriptTransform,
    legacyInsertableStreams,
    insertableStreams,
    qevFrameEncryption: "not-supported",
    status: "transport-only",
    label: "WebRTC transport encryption only",
    notes: [
      "WebRTC media transport encryption is available.",
      "This browser does not expose encoded-frame transform hooks.",
      "QEV frame-level media encryption cannot be enabled in this browser yet.",
      "QEV encrypted chat, control intents, room lock, safety verification, and transcript export still work.",
    ],
  };
}
