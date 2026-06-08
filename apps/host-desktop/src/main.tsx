import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import "./styles.css";

type HostStatus = {
  relay_url: string;
  device_name: string;
  agent_ready: boolean;
  screen_capture_ready: boolean;
  input_control_ready: boolean;
  active_session: string | null;
  control_granted_until: string | null;
};

function App() {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [relayUrl, setRelayUrl] = useState("wss://qev-workspace.onrender.com/ws");
  const [deviceName, setDeviceName] = useState("QEV Host Mac");
  const [log, setLog] = useState<string[]>(["QEV Host loaded."]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const enabled = await isEnabled();
    setAutostart(enabled);
    const next = await invoke<HostStatus>("host_status");
    setStatus(next);
  }

  async function setAutostartEnabled(next: boolean) {
    if (next) await enable();
    else await disable();
    await refresh();
    push(next ? "Launch at login enabled." : "Launch at login disabled.");
  }

  async function connectRelay() {
    const result = await invoke<string>("connect_relay", { relayUrl, deviceName });
    push(result);
    await refresh();
  }

  async function disconnectRelay() {
    const result = await invoke<string>("disconnect_relay");
    push(result);
    await refresh();
  }

  async function openMacPermissions() {
    const result = await invoke<string>("open_mac_permissions");
    push(result);
  }

  async function approveControl() {
    const result = await invoke<string>("approve_control_for_five_minutes");
    push(result);
    await refresh();
  }

  async function revokeControl() {
    const result = await invoke<string>("revoke_control");
    push(result);
    await refresh();
  }

  function push(message: string) {
    setLog((current) => [`${new Date().toLocaleTimeString()} — ${message}`, ...current].slice(0, 80));
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">QEV Host</p>
          <h1>Native controlled-machine app.</h1>
          <p>
            This app replaces the browser localhost hack. Install once, enable launch at login, grant OS permissions once,
            then approve each remote-control session visibly.
          </p>
        </div>
        <div className={status?.agent_ready ? "badge live" : "badge"}>
          {status?.agent_ready ? "Ready" : "Not ready"}
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Startup</h2>
          <p>Launch at login keeps QEV Host available without terminal commands.</p>
          <button onClick={() => void setAutostartEnabled(!autostart)}>
            {autostart ? "Disable launch at login" : "Enable launch at login"}
          </button>
          <p className="kv"><span>Autostart</span><strong>{autostart ? "enabled" : "disabled"}</strong></p>
        </div>

        <div className="panel">
          <h2>Relay</h2>
          <label>
            Relay URL
            <input value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
          </label>
          <label>
            Host name
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
          </label>
          <div className="row">
            <button onClick={() => void connectRelay()}>Connect host to relay</button>
            <button className="secondary" onClick={() => void disconnectRelay()}>Disconnect</button>
          </div>
          <p className="kv"><span>Active session</span><strong>{status?.active_session ?? "none"}</strong></p>
        </div>

        <div className="panel">
          <h2>Permissions</h2>
          <p>macOS needs Screen Recording for capture and Accessibility for mouse/keyboard input.</p>
          <button onClick={() => void openMacPermissions()}>Open macOS permission settings</button>
          <p className="kv"><span>Screen capture</span><strong>{status?.screen_capture_ready ? "ready" : "needs setup"}</strong></p>
          <p className="kv"><span>Input control</span><strong>{status?.input_control_ready ? "ready" : "needs setup"}</strong></p>
        </div>

        <div className="panel">
          <h2>Control approval</h2>
          <p>Control is never silent. Approve only when you are present.</p>
          <div className="row">
            <button onClick={() => void approveControl()}>Approve control for 5 minutes</button>
            <button className="danger" onClick={() => void revokeControl()}>Revoke</button>
          </div>
          <p className="kv"><span>Granted until</span><strong>{status?.control_granted_until ?? "not granted"}</strong></p>
        </div>

        <div className="panel wide">
          <h2>Status</h2>
          <pre>{JSON.stringify(status, null, 2)}</pre>
        </div>

        <div className="panel wide">
          <h2>Log</h2>
          <ul>
            {log.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}
          </ul>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
