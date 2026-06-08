import React, { type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

type ErrorBoundaryState = {
  error: Error | null;
};

class QevErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("QEV render crash", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="shell crash-shell">
          <section className="hero">
            <div>
              <p className="eyebrow">QEV Workspace</p>
              <h1>App render failed.</h1>
              <p className="lede">
                QEV caught a client-side crash instead of leaving a blank screen. Open DevTools console for the stack trace.
              </p>
              <div className="safety-line">No session data was sent because the app did not finish rendering.</div>
            </div>
            <div className="status-card">
              <span>Error</span>
              <strong className="status error">render crash</strong>
              <small>{this.state.error.message}</small>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QevErrorBoundary>
      <App />
    </QevErrorBoundary>
  </React.StrictMode>,
);
