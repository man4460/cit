import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { err: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary:", err, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center">
          <p className="text-lg font-semibold text-white">เกิดข้อผิดพลาดในแอป</p>
          <p className="max-w-md text-sm text-slate-400 whitespace-pre-wrap">{this.state.err.message}</p>
          <button
            type="button"
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500"
            onClick={() => window.location.reload()}
          >
            โหลดหน้าใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
