import { useState, type FormEvent } from "react";
import { AuthenticationError, ConfigurationError, login, register } from "./auth";
import "./auth.css";

type LoginProps = {
  onAuthenticated: (token: string) => void;
};

export function Login({ onAuthenticated }: LoginProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const token = mode === "register"
        ? await register(email, password, displayName || undefined)
        : await login(email, password);
      onAuthenticated(token);
    } catch (reason) {
      if (reason instanceof ConfigurationError || reason instanceof AuthenticationError) {
        setError(reason.message);
      } else {
        setError(reason instanceof Error ? reason.message : "Authentication failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell" data-testid="login-view">
      <section className="login-card" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">QEV Workspace</p>
          <h1 id="login-title">{mode === "register" ? "Create account" : "Sign in"}</h1>
          <p className="login-card__lede">
            Authenticate before opening persistent rooms, text chat, voice, or remote collaboration tools.
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label htmlFor="qev-register-name">Display name</label>
              <input
                id="qev-register-name"
                data-testid="register-display-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={80}
                disabled={submitting}
              />
            </>
          ) : null}

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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
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
            {submitting
              ? (mode === "register" ? "Creating account…" : "Signing in…")
              : (mode === "register" ? "Create account" : "Sign in")}
          </button>
        </form>

        <p className="login-card__switch">
          {mode === "login" ? (
            <>
              Need an account?{" "}
              <button type="button" data-testid="switch-to-register" onClick={() => setMode("register")}>
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{" "}
              <button type="button" data-testid="switch-to-login" onClick={() => setMode("login")}>
                Sign in
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
