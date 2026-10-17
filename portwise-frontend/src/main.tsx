import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/sora/wght.css";
import "./styles/globals.css";
import { resolveDemoMode, setDemoActive } from "./lib/demo-mode";
import { App } from "./App";

async function start() {
  if (resolveDemoMode()) {
    try {
      const { worker } = await import("./mocks/browser");
      await worker.start({ quiet: true });
      setDemoActive(true);
    } catch (e) {
      console.error("Demo mode could not start; using the live API.", e);
    }
  }
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
