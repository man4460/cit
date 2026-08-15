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
        <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-lg font-black text-[#1e1b3a]">เกิดข้อผิดพลาดในแอป</p>
          <p className="max-w-md text-sm text-slate-600 whitespace-pre-wrap">{this.state.err.message}</p>
          <button
            type="button"
            className="rounded-full bg-gradient-to-r from-[#0000BF] via-[#8b5cf6] to-[#ec4899] px-4 py-2 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/25 hover:from-[#0000a3] hover:via-[#7c3aed] hover:to-[#db2777]"
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
