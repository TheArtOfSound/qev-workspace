import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationError,
  ConfigurationError,
  clearStoredToken,
  decodeToken,
  getStoredToken,
  isAccessTokenValid,
  login,
  logout,
  QEV_TOKEN_STORAGE_KEY,
  resolveAuthUrl,
} from "../auth";

function makeToken(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    sub: "usr_test",
    email: "test@qev.local",
    name: "Test User",
    iat: 1,
    exp,
    iss: "qev-workspace",
    aud: "qev-workspace-web",
    jti: "jti_test",
  })).toString("base64url");
  return `${header}.${body}.signature`;
}

const VALID_TOKEN = makeToken(Math.floor(Date.now() / 1000) + 3600);
const EXPIRED_TOKEN = makeToken(Math.floor(Date.now() / 1000) - 30);

test("login stores the returned JWT under qev_token", async (context) => {
  const storage = installMemoryStorage();
  const originalFetch = globalThis.fetch;
  const env = installProcessEnv({
    VITE_DEV: "true",
    NODE_ENV: "development",
  });

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/auth/login");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "test@qev.local",
      password: "correct-password",
    });

    return new Response(JSON.stringify({ token: VALID_TOKEN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  context.after(() => {
    globalThis.fetch = originalFetch;
    uninstallMemoryStorage();
    restoreProcessEnv(env);
  });

  const token = await login(" Test@QEV.local ", "correct-password");

  assert.equal(token, VALID_TOKEN);
  assert.equal(storage.getItem(QEV_TOKEN_STORAGE_KEY), VALID_TOKEN);
  assert.equal(getStoredToken(), VALID_TOKEN);
});

test("login surfaces endpoint failures and does not persist a token", async (context) => {
  const storage = installMemoryStorage();
  const originalFetch = globalThis.fetch;
  const env = installProcessEnv({
    VITE_DEV: "true",
    NODE_ENV: "development",
  });

  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "Invalid email or password." }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );

  context.after(() => {
    globalThis.fetch = originalFetch;
    uninstallMemoryStorage();
    restoreProcessEnv(env);
  });

  await assert.rejects(
    login("test@qev.local", "wrong-password"),
    (reason: unknown) => {
      assert.ok(reason instanceof AuthenticationError);
      assert.equal(reason.status, 401);
      assert.equal(reason.message, "Invalid email or password.");
      return true;
    },
  );

  assert.equal(storage.getItem(QEV_TOKEN_STORAGE_KEY), null);
});

test("expired and malformed JWTs are rejected", () => {
  installMemoryStorage();
  localStorage.setItem(QEV_TOKEN_STORAGE_KEY, EXPIRED_TOKEN);
  assert.equal(getStoredToken(), null);
  assert.equal(isAccessTokenValid(EXPIRED_TOKEN), false);
  assert.equal(isAccessTokenValid("not-a-jwt"), false);
  assert.equal(decodeToken("a.b"), null);
  uninstallMemoryStorage();
});

test("logout clears authentication state", async (context) => {
  const storage = installMemoryStorage();
  storage.setItem(QEV_TOKEN_STORAGE_KEY, VALID_TOKEN);
  const originalFetch = globalThis.fetch;
  const env = installProcessEnv({
    VITE_DEV: "true",
    NODE_ENV: "development",
  });

  globalThis.fetch = async () => new Response(null, { status: 204 });
  context.after(() => {
    globalThis.fetch = originalFetch;
    uninstallMemoryStorage();
    restoreProcessEnv(env);
  });

  await logout();
  assert.equal(storage.getItem(QEV_TOKEN_STORAGE_KEY), null);
  clearStoredToken();
});

test("production configuration fails when no auth endpoint is configured", () => {
  const env = installProcessEnv({
    NODE_ENV: "production",
    VITE_DEV: "false",
  });
  delete process.env.VITE_AUTH_API_URL;
  delete process.env.VITE_API_URL;
  delete process.env.VITE_RELAY_URL;
  delete process.env.VITE_ROOMS_URL;

  try {
    assert.throws(() => resolveAuthUrl("/api/auth/login"), (reason: unknown) => {
      assert.ok(reason instanceof ConfigurationError);
      return true;
    });
  } finally {
    restoreProcessEnv(env);
  }
});

function installMemoryStorage(): Storage {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

function uninstallMemoryStorage(): void {
  Reflect.deleteProperty(globalThis, "localStorage");
}

function installProcessEnv(values: Record<string, string>): Record<string, string | undefined> {
  const keys = [
    "NODE_ENV",
    "VITE_DEV",
    "VITE_AUTH_API_URL",
    "VITE_API_URL",
    "VITE_RELAY_URL",
    "VITE_ROOMS_URL",
  ];
  const previous: Record<string, string | undefined> = {};
  for (const key of keys) previous[key] = process.env[key];
  for (const key of keys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  return previous;
}

function restoreProcessEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
