# QEV Integration

QEV Workspace should treat QEV as the local secret and envelope layer.

## What QEV protects

- Device identity private keys
- Long-term local device profile
- Trusted peer records, later
- Local audit encryption keys, later
- Optional exported session receipts

## What QEV does not replace

QEV does not replace:

- WebRTC transport security
- OS permission prompts
- Relay authorization
- Session consent UX
- Desktop agent sandboxing

## Integration boundary

`packages/crypto` exposes a narrow interface:

```ts
export interface QevVaultAdapter {
  createDeviceIdentity(): Promise<DeviceIdentity>;
  loadDeviceIdentity(): Promise<DeviceIdentity | null>;
  sealSecret(label: string, bytes: Uint8Array): Promise<Uint8Array>;
  openSecret(label: string, sealed: Uint8Array): Promise<Uint8Array>;
}
```

The browser MVP uses temporary in-memory identities. Production desktop builds should use QEV-protected local storage.
