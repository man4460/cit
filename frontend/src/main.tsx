import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { applyPwaStandaloneClass } from "./lib/pwaStandalone";
import "./index.css";

applyPwaStandaloneClass();
if (typeof window !== "undefined") {
  window.addEventListener("appinstalled", applyPwaStandaloneClass);
  window.matchMedia("(display-mode: standalone)").addEventListener("change", applyPwaStandaloneClass);
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style=\"font-family:sans-serif;padding:1rem\">ไม่พบ element #root</p>";
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}