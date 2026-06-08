# qev-workspace

CLI installer and launcher for QEV Workspace Host.

Quick start:

    npx qev-workspace install

Commands:

    qev install
    qev doctor
    qev open-release
    qev open-web
    qev status

Security model:

- The host app must be installed intentionally.
- The host computer must approve control.
- macOS/Windows permissions must be granted explicitly.
- Control is time-limited and revocable.
