// src/components/ErrorBoundary.tsx

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; title?: string };
type State = { hasError: boolean; detail?: string };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, detail: msg };
  }

  componentDidCatch(err: unknown) {
    // (Optional) send to analytics or console
    console.error("Chart error:", err);
  }

  handleRetry = () => this.setState({ hasError: false, detail: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <div className="border rounded-xl p-4 bg-amber-50 text-amber-900">
          <div className="font-semibold mb-1">
            {this.props.title ?? "This chart failed to render."}
          </div>
          <div className="text-sm mb-3">
            You can try again. If it keeps happening, adjust inputs or reload.
            {this.state.detail ? (
              <details className="mt-2">
                <summary className="cursor-pointer">Error details</summary>
                <pre className="text-xs mt-1 whitespace-pre-wrap">{this.state.detail}</pre>
              </details>
            ) : null}
          </div>
          <button
            className="text-sm px-3 py-1 rounded border bg-white hover:bg-gray-50"
            onClick={this.handleRetry}
            aria-label="Retry rendering chart"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
