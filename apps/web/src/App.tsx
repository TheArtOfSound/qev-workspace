import { useEffect, useState } from "react";
import { getStoredToken } from "./auth";
import { Login } from "./Login";
import { RoomList } from "./RoomList";
import { RoomView } from "./RoomView";
import { App as WorkspaceApp } from "./WorkspaceApp";
import type { Room } from "./types";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

export function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [routePath, setRoutePath] = useState(() => readPathname());
  const [currentRoomId, setCurrentRoomId] = useState(() => readStorage(CURRENT_ROOM_STORAGE_KEY));
  const [currentRoomName, setCurrentRoomName] = useState(() => readStorage(CURRENT_ROOM_NAME_STORAGE_KEY));

  useEffect(() => {
    const handlePopState = (): void => setRoutePath(readPathname());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!token && !isLoginRoute(routePath)) {
      navigate(loginRoute(), true, setRoutePath);
      return;
    }

    if (token && isLoginRoute(routePath)) {
      navigate(mainRoute(), true, setRoutePath);
    }
  }, [routePath, token]);

  function handleAuthenticated(nextToken: string): void {
    setToken(nextToken);
    navigate(mainRoute(), true, setRoutePath);
  }

  function handleJoined(room: Room): void {
    localStorage.setItem(CURRENT_ROOM_NAME_STORAGE_KEY, room.name);
    setCurrentRoomId(room.id);
    setCurrentRoomName(room.name);
  }

  function handleLeave(): void {
    localStorage.removeItem(CURRENT_ROOM_STORAGE_KEY);
    localStorage.removeItem(CURRENT_ROOM_NAME_STORAGE_KEY);
    setCurrentRoomId("");
    setCurrentRoomName("");
  }

  if (!token) return <Login onAuthenticated={handleAuthenticated} />;

  if (currentRoomId) {
    return <RoomView roomId={currentRoomId} roomName={currentRoomName} onLeave={handleLeave} />;
  }

  return (
    <>
      <RoomList onRoomJoined={handleJoined} />
      <WorkspaceApp />
    </>
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

function isLoginRoute(pathname: string): boolean {
  return trimTrailingSlash(pathname) === trimTrailingSlash(loginRoute());
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
