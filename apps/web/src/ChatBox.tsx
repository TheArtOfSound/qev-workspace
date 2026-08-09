import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getStoredToken, profileFromToken } from "./auth";
import { getMessages, sendMessage } from "./chat";
import type { ChatMessage } from "./types";
import { Avatar } from "./ui";

const POLL_MS = 3_000;

type ChatBoxProps = {
  roomId: string;
  roomName?: string;
};

export function ChatBox({ roomId, roomName }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);
  const seenRef = useRef(new Set<string>());
  const stickBottom = useRef(true);

  const profile = (() => {
    const token = getStoredToken();
    return token ? profileFromToken(token) : null;
  })();

  const refresh = useCallback(async (showLoading = false): Promise<void> => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    if (showLoading) setLoading(true);

    try {
      const next = await getMessages(roomId);
      if (seqRef.current !== seq) return;

      const deduped: ChatMessage[] = [];
      const seen = new Set<string>();
      for (const message of next) {
        const key = message.id ?? `${message.timestamp}:${message.sender}:${message.content}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(message);
      }
      seenRef.current = seen;
      setMessages(deduped);
      setError("");
    } catch (reason) {
      if (seqRef.current === seq) setError(toMessage(reason));
    } finally {
      if (seqRef.current === seq) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll(): void {
    const el = listRef.current;
    if (!el) return;
    stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = content.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");

    try {
      const created = await sendMessage(roomId, text);
      setContent("");
      stickBottom.current = true;
      setMessages((current) => {
        const key = created.id ?? `${created.timestamp}:${created.sender}:${created.content}`;
        if (seenRef.current.has(key)) return current;
        seenRef.current.add(key);
        return [...current, created].sort((a, b) => a.timestamp - b.timestamp);
      });
      await refresh(false);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat" data-testid="chat-box">
      {error ? (
        <p className="chat__error" role="alert">
          {error}
        </p>
      ) : null}

      <div
        className="chat__scroll"
        data-testid="chat-message-list"
        ref={listRef}
        onScroll={onScroll}
        aria-live="polite"
      >
        <div className="chat__welcome">
          <h3>#{roomName || "room"}</h3>
          <p>
            {loading
              ? "Loading messages…"
              : messages.length === 0
                ? "This is the start of the room. Say hi!"
                : null}
          </p>
          <p data-testid="chat-sender-label" className="sr-only">
            Posting as {profile?.displayName ?? "you"}
          </p>
        </div>

        {messages.map((message, index) => (
          <article
            className="msg"
            data-testid="chat-message"
            key={message.id ?? `${message.timestamp}-${message.sender}-${index}`}
          >
            <Avatar name={message.sender} id={message.senderUserId} />
            <div className="msg__body">
              <div className="msg__head">
                <strong>{message.sender}</strong>
                <time dateTime={new Date(message.timestamp).toISOString()}>
                  {formatTime(message.timestamp)}
                </time>
              </div>
              <p>{message.content}</p>
            </div>
          </article>
        ))}
      </div>

      <form className="chat__compose" onSubmit={handleSend}>
        <label htmlFor="chat-message-content" className="sr-only">
          Message
        </label>
        <input
          id="chat-message-content"
          data-testid="chat-message-input"
          value={content}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setContent(event.target.value)}
          placeholder={`Message #${roomName || "room"}`}
          maxLength={2_000}
          autoComplete="off"
        />
        <button data-testid="chat-send-button" type="submit" disabled={sending || !content.trim()}>
          {sending ? "…" : "Send"}
        </button>
      </form>
    </section>
  );
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Couldn't send. Try again.";
}
