# QEV Workspace

**Consent-first remote workspace tooling for teams.**

QEV Workspace is built around one rule:

> No silent access. No unattended control. No hidden monitoring.

This npm package is a lightweight installer and launcher for **QEV Host**, the native desktop app that runs on the computer being controlled.

## What this package does

`qev-workspace` helps users:

- open the QEV Workspace web app
- check their platform
- find the right QEV Host installer
- download and launch the Mac or Windows desktop installer from GitHub Releases

It does **not** silently install remote-control software. It does **not** run a hidden agent. It does **not** bypass OS permissions.

## Quick start

```bash
npx qev-workspace install
```

Open the web app:

```bash
npx qev-workspace open-web
```

Check your setup:

```bash
npx qev-workspace doctor
```

## Commands

```bash
qev-workspace install
```

Download and open the right QEV Host installer for this computer.

```bash
qev-workspace doctor
```

Check Node version, platform, GitHub release availability, and matching installer assets.

```bash
qev-workspace status
```

Show basic local install hints.

```bash
qev-workspace open-web
```

Open the QEV Workspace public web app.

```bash
qev-workspace open-release
```

Open the QEV Host GitHub Releases page.

```bash
qev-workspace help
```

Show command help.

## Architecture

QEV Workspace has two parts.

### Web app

Used for session creation, joining sessions, viewing remote screens, requesting control, and approving or revoking control.

```text
https://theartofsound.github.io/qev-workspace/
```

### QEV Host desktop app

Installed on the computer being controlled.

Used for native screen capture, launch-at-login, OS permission checks, visible control approval, and future native input execution.

```text
https://github.com/TheArtOfSound/qev-workspace/releases
```

## Security model

QEV Workspace is designed around explicit consent.

- The host app must be installed intentionally.
- The controlled computer must approve control.
- macOS and Windows permissions must be granted explicitly.
- Control is time-limited.
- Control can be revoked.
- The browser is not treated as the controlled computer.
- The native host app is responsible for OS-level behavior.

## Platform support

| Platform | Status |
|---|---|
| macOS | Preview installer workflow |
| Windows | Preview installer workflow |
| Linux | Not packaged yet |

## Example flow

On the computer being controlled:

```bash
npx qev-workspace install
```

Then install QEV Host, open it, enable launch at login, grant required OS permissions, and use the QEV Workspace web app for sessions.

On the viewer computer:

```bash
npx qev-workspace open-web
```

## Repository

```text
https://github.com/TheArtOfSound/qev-workspace
```

## License

UNLICENSED preview package.
