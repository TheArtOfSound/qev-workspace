import { useState, type FormEvent } from "react";
import { login } from "./auth";
import "./auth.css";

type LoginProps = {
  onAuthenticated: (token: string) => void;
};

export function Login({ onAuthenticated }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const token = await login(email, password);
      onAuthenticated(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell" data-testid="login-view">
      <section className="login-card" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">QEV Workspace</p>
          <h1 id="login-title">Sign in</h1>
          <p className="login-card__lede">
            Authenticate before opening persistent rooms, text chat, voice, or remote collaboration tools.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="qev-login-email">Email</label>
          <input
            id="qev-login-email"
            data-testid="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={submitting}
          />

          <label htmlFor="qev-login-password">Password</label>
          <input
            id="qev-login-password"
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            minLength={8}
            required
            disabled={submitting}
          />

          {error ? (
            <p className="login-form__error" data-testid="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button data-testid="login-submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
