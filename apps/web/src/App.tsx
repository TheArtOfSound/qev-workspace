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
import { ProfileModal } from "./ProfileModal";
import { RoomList } from "./RoomList";
import { RoomView } from "./RoomView";
import { SimpleShare } from "./SimpleShare";
import { joinWithInvite } from "./rooms";
import type { Room, UserProfile } from "./types";
import { Avatar } from "./ui";
import "./product.css";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

type Screen = "chat" | "share";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [banner, setBanner] = useState("");
  const [pendingInvite, setPendingInvite] = useState(() => readInviteFromUrl());

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

  // After login, redeem invite link if present.
  useEffect(() => {
    if (!authReady || !token || !pendingInvite) return;

    let cancelled = false;
    void (async () => {
      try {
        const room = await joinWithInvite(pendingInvite);
        if (cancelled) return;
        setCurrentRoomId(room.id);
        setCurrentRoomName(room.name);
        setRoomsKey((n) => n + 1);
        setBanner(`Joined #${room.name}`);
        clearInviteFromUrl();
        setPendingInvite("");
        setScreen("chat");
      } catch (reason) {
        if (cancelled) return;
        setBanner(reason instanceof Error ? reason.message : "Couldn't use that invite.");
        clearInviteFromUrl();
        setPendingInvite("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, token, pendingInvite]);

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

  if (!token) {
    return (
      <>
        {pendingInvite ? (
          <div className="invite-notice" data-testid="invite-login-notice">
            You have an invite. Log in or create an account to join.
          </div>
        ) : null}
        <Login onAuthenticated={handleAuthenticated} />
      </>
    );
  }

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
            Screen share is open.
            <br />
            <button
              type="button"
              className="btn btn--green"
              style={{ marginTop: 12 }}
              onClick={() => setScreen("chat")}
            >
              Back to chat
            </button>
          </div>
        )}

        <button
          type="button"
          className="sidebar__more"
          data-testid="nav-advanced"
          onClick={() => setScreen((s) => (s === "share" ? "chat" : "share"))}
        >
          {screen === "share" ? "← Chat rooms" : "Share screen"}
        </button>

        <footer className="sidebar__user" data-testid="session-bar">
          <button
            type="button"
            className="sidebar__user-btn"
            data-testid="open-profile-button"
            onClick={() => setProfileOpen(true)}
            title="Edit your name"
          >
            <Avatar name={profile?.displayName ?? "You"} id={profile?.id} />
            <div className="sidebar__user-meta">
              <strong data-testid="session-user-name">{profile?.displayName ?? "You"}</strong>
              <span>Edit profile</span>
            </div>
          </button>
          <span data-testid="session-user-email" className="sr-only">
            {profile?.email ?? ""}
          </span>
          <button type="button" data-testid="logout-button" onClick={() => void handleLogout()}>
            Log out
          </button>
        </footer>
      </aside>

      <main className="main">
        {banner ? (
          <div className="app-banner" data-testid="app-banner" role="status">
            <span>{banner}</span>
            <button type="button" className="btn btn--ghost" onClick={() => setBanner("")}>
              Dismiss
            </button>
          </div>
        ) : null}

        {screen === "share" ? (
          <SimpleShare onBack={() => setScreen("chat")} />
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
                <li>Hit <strong>Invite</strong> to add people</li>
              </ol>
            </div>
          </div>
        )}
      </main>

      {profileOpen && profile ? (
        <ProfileModal
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSaved={(next) => setProfile(next)}
        />
      ) : null}
    </div>
  );
}

function readInviteFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("invite")?.trim() ?? "";
}

function clearInviteFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite") && !url.searchParams.has("room")) return;
  url.searchParams.delete("invite");
  url.searchParams.delete("room");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
