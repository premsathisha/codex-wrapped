import { useEffect } from "react";
import { Toaster } from "@shared/components/ui/sonner";
import Dashboard from "./components/Dashboard";
import { useRPC } from "./hooks/useRPC";

type ThemeMode = "system" | "light" | "dark";

const applyTheme = (theme: ThemeMode) => {
  document.documentElement.dataset.theme = theme;
};

const App = () => {
  const rpc = useRPC();

  useEffect(() => {
    let active = true;

    void rpc.request.getSettings({})
      .then((settings) => {
        if (!active) return;
        applyTheme(settings.theme);
      })
      .catch(() => {
        if (!active) return;
        applyTheme("system");
      });

    return () => {
      active = false;
    };
  }, [rpc]);

  useEffect(() => {
    const listener = (payload: unknown) => {
      if (!payload || typeof payload !== "object") return;
      const theme = (payload as { theme?: ThemeMode }).theme;
      if (theme === "system" || theme === "light" || theme === "dark") {
        applyTheme(theme);
      }
    };

    rpc.addMessageListener("themeChanged", listener);
    return () => {
      rpc.removeMessageListener("themeChanged", listener);
    };
  }, [rpc]);

  return (
    <div className="h-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-primary)]">
      <Dashboard />
      <Toaster position="bottom-right" />
    </div>
  );
};

export default App;
