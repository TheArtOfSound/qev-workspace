# Desktop Agent

The desktop agent is intentionally not implemented in the first scaffold.

This package is reserved for a Tauri/Rust native agent that can safely handle full remote-control permissions after the web MVP proves the session, identity, consent, and audit model.

## Future responsibilities

- Native screen capture
- Mouse/keyboard event injection
- Permanent active-session indicator
- Emergency stop overlay
- Device identity key storage through QEV
- Local audit log storage
- Permission epoch validation
- OS permission onboarding

## Hard restrictions

The agent must not support:

- Hidden access
- Silent background service control
- Unattended access in v1
- Remote shell
- Credential capture
- Privilege escalation

## Proposed stack

```txt
Tauri
Rust
Platform-specific capture/input crates
QEV vault adapter
Signed installers later
```
