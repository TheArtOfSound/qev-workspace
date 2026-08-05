import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { getMessages, sendMessage } from "./chat";
import type { ChatMessage } from "./types";
import "./rooms.css";

const CHAT_SENDER_STORAGE_KEY = "qev.workspace.chatSender";
const CHAT_REFRESH_INTERVAL_MS = 3_000;

type ChatBoxProps = {
  roomId: string;
};

export function ChatBox({ roomId }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sender, setSender] = useState(() => readInitialSender());
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const requestSequenceRef = useRef(0);

  const refreshMessages = useCallback(async (showLoading = false): Promise<void> => {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;

    if (showLoading) setLoading(true);

    try {
      const nextMessages = await getMessages(roomId);
      if (requestSequenceRef.current === sequence) {
        setMessages(nextMessages);
        setError("");
      }
    } catch (reason) {
      if (requestSequenceRef.current === sequence) setError(toMessage(reason));
    } finally {
      if (showLoading && requestSequenceRef.current === sequence) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void refreshMessages(true);
    const timer = window.setInterval(() => void refreshMessages(false), CHAT_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshMessages]);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function handleSenderChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextSender = event.target.value;
    setSender(nextSender);
    localStorage.setItem(CHAT_SENDER_STORAGE_KEY, nextSender);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalizedSender = sender.trim();
    const normalizedContent = content.trim();
    if (!normalizedSender || !normalizedContent || sending) return;

    setSending(true);
    setError("");

    try {
      await sendMessage(roomId, {
        sender: normalizedSender,
        content: normalizedContent,
      });
      setContent("");
      await refreshMessages(false);
    } catch (reason) {
      setError(toMessage(reason));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="room-chat" data-testid="chat-box" aria-labelledby="room-chat-title">
      <div className="room-chat__header">
        <div>
          <p className="eyebrow">Room chat</p>
          <h2 id="room-chat-title">Messages</h2>
        </div>
        <label className="room-chat__sender">
          <span>Display name</span>
          <input
            data-testid="chat-sender-input"
            value={sender}
            onChange={handleSenderChange}
            maxLength={80}
            autoComplete="nickname"
          />
        </label>
      </div>

      {error ? <p className="persistent-rooms__error" role="alert">{error}</p> : null}

      <div
        className="room-chat__messages"
        data-testid="chat-message-list"
        ref={messageListRef}
        aria-live="polite"
      >
        {loading ? (
          <p className="persistent-rooms__empty">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="persistent-rooms__empty">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((message, index) => (
            <article
              className="room-chat__message"
              data-testid="chat-message"
              key={`${message.timestamp}-${message.sender}-${index}`}
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
        <label htmlFor="chat-message-content">Message</label>
        <div>
          <input
            id="chat-message-content"
            data-testid="chat-message-input"
            value={content}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setContent(event.target.value)}
            placeholder="Write a message"
            maxLength={2_000}
            autoComplete="off"
          />
          <button
            data-testid="chat-send-button"
            type="submit"
            disabled={sending || !sender.trim() || !content.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}

function readInitialSender(): string {
  if (typeof window === "undefined") return "Anonymous";
  return localStorage.getItem(CHAT_SENDER_STORAGE_KEY)
    ?? localStorage.getItem("qev.workspace.memberId")
    ?? "Anonymous";
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "The chat operation failed.";
}
