import { useEffect, useState } from "react";
import {
  clearStoredToken,
  fetchCurrentUser,
  getStoredToken,
  logout,
  profileFromToken,
  refreshAccessToken,
} from "./auth";
import { Login } from "./Login";
import { RoomList } from "./RoomList";
import { RoomView } from "./RoomView";
import { App as WorkspaceApp } from "./WorkspaceApp";
import type { Room, UserProfile } from "./types";
import "./auth.css";
import "./rooms.css";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

type MainView = "rooms" | "advanced";

export function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const stored = getStoredToken();
    return stored ? profileFromToken(stored) : null;
  });
  const [routePath, setRoutePath] = useState(() => readPathname());
  const [currentRoomId, setCurrentRoomId] = useState(() => readStorage(CURRENT_ROOM_STORAGE_KEY));
  const [currentRoomName, setCurrentRoomName] = useState(() => readStorage(CURRENT_ROOM_NAME_STORAGE_KEY));
  const [authReady, setAuthReady] = useState(false);
  const [mainView, setMainView] = useState<MainView>("rooms");
  const [roomsRefreshKey, setRoomsRefreshKey] = useState(0);

  useEffect(() => {
    const handlePopState = (): void => setRoutePath(readPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let activeToken = getStoredToken();
      if (!activeToken) {
        activeToken = await refreshAccessToken();
      }

      if (cancelled) return;

      if (!activeToken) {
        setToken(null);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setToken(activeToken);
      const user = await fetchCurrentUser();
      if (cancelled) return;
      if (!user) {
        clearStoredToken();
        setToken(null);
        setProfile(null);
      } else {
        setProfile(user);
      }
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;

    if (!token && !isLoginRoute(routePath) && !isRegisterRoute(routePath)) {
      navigate(loginRoute(), true, setRoutePath);
      return;
    }

    if (token && (isLoginRoute(routePath) || isRegisterRoute(routePath))) {
      navigate(mainRoute(), true, setRoutePath);
    }
  }, [routePath, token, authReady]);

  function handleAuthenticated(nextToken: string): void {
    setToken(nextToken);
    setProfile(profileFromToken(nextToken));
    navigate(mainRoute(), true, setRoutePath);
  }

  function handleJoined(room: Room): void {
    localStorage.setItem(CURRENT_ROOM_NAME_STORAGE_KEY, room.name);
    localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, room.id);
    setCurrentRoomId(room.id);
    setCurrentRoomName(room.name);
    setMainView("rooms");
  }

  function handleLeave(): void {
    localStorage.removeItem(CURRENT_ROOM_STORAGE_KEY);
    localStorage.removeItem(CURRENT_ROOM_NAME_STORAGE_KEY);
    setCurrentRoomId("");
    setCurrentRoomName("");
    setRoomsRefreshKey((value) => value + 1);
  }

  async function handleLogout(): Promise<void> {
    await logout();
    handleLeave();
    setToken(null);
    setProfile(null);
    navigate(loginRoute(), true, setRoutePath);
  }

  if (!authReady) {
    return (
      <main className="login-shell" data-testid="auth-loading">
        <p>Checking session…</p>
      </main>
    );
  }

  if (!token) return <Login onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app-shell" data-testid="authenticated-app">
      <aside className="app-sidebar" data-testid="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__mark">QEV</span>
          <div>
            <strong>Workspace</strong>
            <small>Rooms · chat · voice</small>
          </div>
        </div>

        <nav className="app-sidebar__nav" aria-label="Primary">
          <button
            type="button"
            className={mainView === "rooms" ? "is-active" : ""}
            onClick={() => setMainView("rooms")}
            data-testid="nav-rooms"
          >
            Rooms
          </button>
          <button
            type="button"
            className={mainView === "advanced" ? "is-active" : ""}
            onClick={() => setMainView("advanced")}
            data-testid="nav-advanced"
            title="Screen share and remote-control tools"
          >
            Advanced
          </button>
        </nav>

        {mainView === "rooms" ? (
          <RoomList
            key={roomsRefreshKey}
            activeRoomId={currentRoomId}
            onRoomJoined={handleJoined}
          />
        ) : (
          <div className="app-sidebar__hint">
            <p>Screen share, device identity, and remote control live here.</p>
            <p>Day-to-day chat and voice stay under Rooms.</p>
          </div>
        )}

        <footer className="app-sidebar__user" data-testid="session-bar">
          <div>
            <strong data-testid="session-user-name">{profile?.displayName ?? "User"}</strong>
            <span data-testid="session-user-email">{profile?.email ?? ""}</span>
          </div>
          <button type="button" data-testid="logout-button" onClick={() => void handleLogout()}>
            Log out
          </button>
        </footer>
      </aside>

      <main className="app-main">
        {mainView === "advanced" ? (
          <div className="app-advanced" data-testid="advanced-panel">
            <header className="app-main__header">
              <div>
                <p className="app-main__eyebrow">Advanced tools</p>
                <h1>Screen share & control</h1>
                <p className="app-main__lede">
                  Optional tools for secure remote sessions. Use Rooms for normal team chat and voice.
                </p>
              </div>
              <button type="button" className="app-btn secondary" onClick={() => setMainView("rooms")}>
                Back to rooms
              </button>
            </header>
            <div className="app-advanced__body">
              <WorkspaceApp />
            </div>
          </div>
        ) : currentRoomId ? (
          <RoomView
            roomId={currentRoomId}
            roomName={currentRoomName}
            onLeave={handleLeave}
          />
        ) : (
          <div className="app-empty" data-testid="no-room-selected">
            <div>
              <p className="app-main__eyebrow">Welcome</p>
              <h1>Pick a room to get started</h1>
              <p>
                Create a room in the sidebar, or join one you already belong to.
                Chat and 2-person voice live inside each room.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function navigate(path: string, replace: boolean, setRoutePath: (path: string) => void): void {
  if (typeof window === "undefined") return;
  const current = window.location.pathname;
  if (current !== path) {
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
  }
  setRoutePath(path);
}

function mainRoute(): string {
  return normalizeBasePath(import.meta.env.BASE_URL ?? "/");
}

function loginRoute(): string {
  const base = mainRoute();
  return `${base}${base.endsWith("/") ? "" : "/"}login`;
}

function registerRoute(): string {
  const base = mainRoute();
  return `${base}${base.endsWith("/") ? "" : "/"}register`;
}

function isLoginRoute(pathname: string): boolean {
  return trimTrailingSlash(pathname) === trimTrailingSlash(loginRoute());
}

function isRegisterRoute(pathname: string): boolean {
  return trimTrailingSlash(pathname) === trimTrailingSlash(registerRoute());
}

function normalizeBasePath(base: string): string {
  const withLeadingSlash = base.startsWith("/") ? base : `/${base}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function readPathname(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

function readStorage(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}
