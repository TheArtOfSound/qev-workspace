import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { profileFromToken, getStoredToken } from "./auth";
import { getMessages, sendMessage } from "./chat";
import type { ChatMessage } from "./types";
import "./rooms.css";

const CHAT_REFRESH_INTERVAL_MS = 3_000;

type ChatBoxProps = {
  roomId: string;
};

export function ChatBox({ roomId }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);
  const seenIdsRef = useRef(new Set<string>());
  const stickToBottomRef = useRef(true);

  const profile = (() => {
    const token = getStoredToken();
    return token ? profileFromToken(token) : null;
  })();

  const refreshMessages = useCallback(async (showLoading = false): Promise<void> => {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;

    if (showLoading) setLoading(true);

    try {
      const nextMessages = await getMessages(roomId);
      if (requestSequenceRef.current === sequence) {
        const deduped: ChatMessage[] = [];
        const nextSeen = new Set<string>();
        for (const message of nextMessages) {
          const key = message.id ?? `${message.timestamp}:${message.sender}:${message.content}`;
          if (nextSeen.has(key)) continue;
          nextSeen.add(key);
          deduped.push(message);
        }
        seenIdsRef.current = nextSeen;
        setMessages(deduped);
        setError("");
      }
    } catch (reason) {
      if (requestSequenceRef.current === sequence) setError(toMessage(reason));
    } finally {
      if (requestSequenceRef.current === sequence) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refreshMessages(true);
    const timer = window.setInterval(() => void refreshMessages(false), CHAT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshMessages]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list && stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  function handleScroll(): void {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedContent = content.trim();
    if (!normalizedContent || sending) return;

    setSending(true);
    setError("");

    try {
      const created = await sendMessage(roomId, normalizedContent);
      setContent("");
      stickToBottomRef.current = true;
      setMessages((current) => {
        const key = created.id ?? `${created.timestamp}:${created.sender}:${created.content}`;
        if (seenIdsRef.current.has(key)) return current;
        seenIdsRef.current.add(key);
        return [...current, created].sort((left, right) => left.timestamp - right.timestamp);
      });
      await refreshMessages(false);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="room-chat" data-testid="chat-box" aria-label="Messages">
      {error ? (
        <p className="room-chat__error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="room-chat__messages"
        data-testid="chat-message-list"
        ref={messageListRef}
        onScroll={handleScroll}
        aria-live="polite"
      >
        {loading ? (
          <p className="room-chat__empty">Loading messages…</p>
        ) : messages.length === 0 ? (
          <div className="room-chat__empty-state">
            <h2>No messages yet</h2>
            <p>Say hello — this is the start of #{/* room filled by parent context */}</p>
            <p data-testid="chat-sender-label">
              You&apos;re posting as <strong>{profile?.displayName ?? "you"}</strong>
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <article
              className="room-chat__message"
              data-testid="chat-message"
              key={message.id ?? `${message.timestamp}-${message.sender}-${index}`}
            >
              <header>
                <strong>{message.sender}</strong>
                <time dateTime={new Date(message.timestamp).toISOString()}>
                  {formatTimestamp(message.timestamp)}
                </time>
              </header>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>

      <form className="room-chat__composer" onSubmit={handleSend}>
        <label htmlFor="chat-message-content" className="sr-only">
          Message
        </label>
        <input
          id="chat-message-content"
          data-testid="chat-message-input"
          value={content}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setContent(event.target.value)}
          placeholder={`Message as ${profile?.displayName ?? "you"}`}
          maxLength={2_000}
          autoComplete="off"
        />
        <button
          data-testid="chat-send-button"
          type="submit"
          disabled={sending || !content.trim()}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The chat operation failed.";
}
