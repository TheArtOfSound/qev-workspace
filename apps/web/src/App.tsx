import { lazy, Suspense, useEffect, useState } from "react";
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
import type { Room, UserProfile } from "./types";
import { Avatar } from "./ui";
import "./product.css";

// Lazy so lab console CSS never loads on the chat path until user asks for tools.
const WorkspaceApp = lazy(async () => {
  const mod = await import("./WorkspaceApp");
  return { default: mod.App };
});

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

type Screen = "chat" | "tools";

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
  const [screen, setScreen] = useState<Screen>("chat");
  const [roomsKey, setRoomsKey] = useState(0);

  useEffect(() => {
    const onPop = (): void => setRoutePath(readPathname());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let active = getStoredToken();
      if (!active) active = await refreshAccessToken();
      if (cancelled) return;

      if (!active) {
        setToken(null);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setToken(active);
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
      go(loginRoute(), true, setRoutePath);
      return;
    }
    if (token && (isLoginRoute(routePath) || isRegisterRoute(routePath))) {
      go(homeRoute(), true, setRoutePath);
    }
  }, [routePath, token, authReady]);

  function handleAuthenticated(next: string): void {
    setToken(next);
    setProfile(profileFromToken(next));
    go(homeRoute(), true, setRoutePath);
  }

  function handleJoined(room: Room): void {
    localStorage.setItem(CURRENT_ROOM_NAME_STORAGE_KEY, room.name);
    localStorage.setItem(CURRENT_ROOM_STORAGE_KEY, room.id);
    setCurrentRoomId(room.id);
    setCurrentRoomName(room.name);
    setScreen("chat");
  }

  function handleLeave(): void {
    localStorage.removeItem(CURRENT_ROOM_STORAGE_KEY);
    localStorage.removeItem(CURRENT_ROOM_NAME_STORAGE_KEY);
    setCurrentRoomId("");
    setCurrentRoomName("");
    setRoomsKey((n) => n + 1);
  }

  async function handleLogout(): Promise<void> {
    await logout();
    handleLeave();
    setToken(null);
    setProfile(null);
    go(loginRoute(), true, setRoutePath);
  }

  if (!authReady) {
    return (
      <div className="loading" data-testid="auth-loading">
        Loading…
      </div>
    );
  }

  if (!token) return <Login onAuthenticated={handleAuthenticated} />;

  return (
    <div className="app" data-testid="authenticated-app">
      <aside className="sidebar" data-testid="app-sidebar">
        <div className="sidebar__top">
          <h1>QEV</h1>
          <p>Chat with your team</p>
        </div>

        {screen === "chat" ? (
          <RoomList
            key={roomsKey}
            activeRoomId={currentRoomId}
            onRoomJoined={handleJoined}
          />
        ) : (
          <div className="sidebar__empty" style={{ margin: 12 }}>
            Screen share tools are open on the right.
            <br />
            <button type="button" className="btn btn--green" style={{ marginTop: 12 }} onClick={() => setScreen("chat")}>
              Back to chat
            </button>
          </div>
        )}

        <button
          type="button"
          className="sidebar__more"
          data-testid="nav-advanced"
          onClick={() => setScreen((s) => (s === "tools" ? "chat" : "tools"))}
        >
          {screen === "tools" ? "← Chat rooms" : "Screen share tools…"}
        </button>

        <footer className="sidebar__user" data-testid="session-bar">
          <Avatar name={profile?.displayName ?? "You"} id={profile?.id} />
          <div className="sidebar__user-meta">
            <strong data-testid="session-user-name">{profile?.displayName ?? "You"}</strong>
            <span data-testid="session-user-email" className="sr-only">
              {profile?.email ?? ""}
            </span>
          </div>
          <button type="button" data-testid="logout-button" onClick={() => void handleLogout()}>
            Log out
          </button>
        </footer>
      </aside>

      <main className="main">
        {screen === "tools" ? (
          <div className="advanced" data-testid="advanced-panel">
            <div className="advanced__bar">
              <p>Optional tools for screen sharing. Normal chat is under rooms.</p>
              <button type="button" className="btn btn--muted" onClick={() => setScreen("chat")}>
                Back to chat
              </button>
            </div>
            <div className="advanced__body">
              <Suspense fallback={<div className="loading">Loading tools…</div>}>
                <WorkspaceApp />
              </Suspense>
            </div>
          </div>
        ) : currentRoomId ? (
          <RoomView
            roomId={currentRoomId}
            roomName={currentRoomName}
            onLeave={handleLeave}
          />
        ) : (
          <div className="home" data-testid="no-room-selected">
            <div className="home__card">
              <div className="home__icon">#</div>
              <h2>Pick a room</h2>
              <p>Rooms are on the left.</p>
              <ol>
                <li>Type a name and hit <strong>Add</strong></li>
                <li>Click the room</li>
                <li>Chat — or hit <strong>Join voice</strong></li>
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function go(path: string, replace: boolean, setRoutePath: (path: string) => void): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== path) {
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
  }
  setRoutePath(path);
}

function homeRoute(): string {
  return normalizeBase(import.meta.env.BASE_URL ?? "/");
}

function loginRoute(): string {
  const base = homeRoute();
  return `${base}${base.endsWith("/") ? "" : "/"}login`;
}

function registerRoute(): string {
  const base = homeRoute();
  return `${base}${base.endsWith("/") ? "" : "/"}register`;
}

function isLoginRoute(pathname: string): boolean {
  return trimSlash(pathname) === trimSlash(loginRoute());
}

function isRegisterRoute(pathname: string): boolean {
  return trimSlash(pathname) === trimSlash(registerRoute());
}

function normalizeBase(base: string): string {
  const withSlash = base.startsWith("/") ? base : `/${base}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

function trimSlash(path: string): string {
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
