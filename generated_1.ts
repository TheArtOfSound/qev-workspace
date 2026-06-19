// Before
const DEFAULT_RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";

// After
const DEFAULT_RELAY_URL = process.env.RENDER_RELAY_URL ?? "wss://qev-workspace.onrender.com/ws";
