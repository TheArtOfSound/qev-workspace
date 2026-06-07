# Security Policy

QEV Workspace is a consent-first remote workspace. Security issues are treated as product-critical.

## Hard safety rules

The project must not introduce:

- Hidden remote access
- Silent monitoring
- Unauthorized persistence
- Credential capture
- Unattended access in early milestones
- Remote shell access
- Privilege escalation
- Bypass of operating-system permission prompts

## Reportable vulnerabilities

Report issues involving:

- Session hijacking
- Pairing code reuse
- Cross-room message delivery
- Permission bypass
- Control after revocation
- Audit log tampering
- Peer identity spoofing
- Relay leakage of private session contents
- XSS or CSRF in the web app
- Secret/key exposure

## Design expectation

Every privileged action must be:

1. Explicitly requested
2. Explicitly granted
3. Visibly active
4. Time-bounded
5. Revocable instantly
6. Written to an audit log

## Cryptography note

This scaffold defines the crypto boundary. Production cryptography must be reviewed before public trust claims are made.
