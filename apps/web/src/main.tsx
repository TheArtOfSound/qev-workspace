import React, { type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./product.css";

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
        <main className="crash">
          <h1>Something broke</h1>
          <p>Refresh the page and try again.</p>
          <small>{this.state.error.message}</small>
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
