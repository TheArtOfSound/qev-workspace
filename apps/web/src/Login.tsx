import { useState, type FormEvent } from "react";
import { AuthenticationError, ConfigurationError, login, register } from "./auth";
import "./product.css";

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
        setError(reason instanceof Error ? reason.message : "That didn't work. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login" data-testid="login-view">
      <section className="login__card">
        <h1 id="login-title">{mode === "register" ? "Create account" : "Welcome back"}</h1>
        <p>
          {mode === "register"
            ? "Pick a name, email, and password to start chatting."
            : "Log in to join rooms, chat, and talk."}
        </p>

        <form className="login__form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <div className="login__field">
              <label htmlFor="qev-register-name">Your name</label>
              <input
                id="qev-register-name"
                data-testid="register-display-name"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={80}
                placeholder="Alex"
                disabled={submitting}
              />
            </div>
          ) : null}

          <div className="login__field">
            <label htmlFor="qev-login-email">Email</label>
            <input
              id="qev-login-email"
              data-testid="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              placeholder="you@email.com"
              disabled={submitting}
            />
          </div>

          <div className="login__field">
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
              placeholder="At least 8 characters"
              disabled={submitting}
            />
          </div>

          {error ? (
            <p className="login__error" data-testid="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="login__submit" data-testid="login-submit" type="submit" disabled={submitting}>
            {submitting
              ? (mode === "register" ? "Creating…" : "Logging in…")
              : (mode === "register" ? "Create account" : "Log in")}
          </button>
        </form>

        <p className="login__switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button type="button" data-testid="switch-to-register" onClick={() => setMode("register")}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" data-testid="switch-to-login" onClick={() => setMode("login")}>
                Log in
              </button>
            </>
          )}
        </p>
      </section>
    </main>
  );
}
