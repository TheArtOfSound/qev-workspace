import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthenticationError,
  login,
  PRODUCTION_LOGIN_ENDPOINT,
  QEV_TOKEN_STORAGE_KEY,
} from "../auth";

const TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfdGVzdCIsImVtYWlsIjoidGVzdEBxZXYubG9jYWwiLCJuYW1lIjoiVGVzdCBVc2VyIiwiaWF0IjoxLCJleHAiOjk5OTk5OTk5OTl9.signature";

test("login stores the returned JWT under qev_token", async (context) => {
  const storage = installMemoryStorage();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), PRODUCTION_LOGIN_ENDPOINT);
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "test@qev.local",
      password: "correct-password",
    });

    return new Response(JSON.stringify({ token: TEST_TOKEN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  context.after(() => {
    globalThis.fetch = originalFetch;
    uninstallMemoryStorage();
  });

  const token = await login(" Test@QEV.local ", "correct-password");

  assert.equal(token, TEST_TOKEN);
  assert.equal(storage.getItem(QEV_TOKEN_STORAGE_KEY), TEST_TOKEN);
});

test("login surfaces endpoint failures and does not persist a token", async (context) => {
  const storage = installMemoryStorage();
  const originalFetch = globalThis.fetch;

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
