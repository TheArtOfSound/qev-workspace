import { useState } from "react";
import { RoomList } from "./RoomList";
import { RoomView } from "./RoomView";
import { App as WorkspaceApp } from "./WorkspaceApp";
import type { Room } from "./types";

const CURRENT_ROOM_STORAGE_KEY = "currentRoom";
const CURRENT_ROOM_NAME_STORAGE_KEY = "currentRoomName";

type AppProps = {
  authenticated?: boolean;
};

export function App({ authenticated = true }: AppProps) {
  const [currentRoomId, setCurrentRoomId] = useState(() => readStorage(CURRENT_ROOM_STORAGE_KEY));
  const [currentRoomName, setCurrentRoomName] = useState(() => readStorage(CURRENT_ROOM_NAME_STORAGE_KEY));

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

  if (!authenticated) return <WorkspaceApp />;

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

function readStorage(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}
