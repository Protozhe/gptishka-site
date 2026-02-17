import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

function safeGetTheme(): "dark" | "light" {
  try {
    return window.localStorage.getItem("admin_theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function safeSetTheme(value: "dark" | "light") {
  try {
    window.localStorage.setItem("admin_theme", value);
  } catch {
    // Ignore storage errors.
  }
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() => safeGetTheme() === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    safeSetTheme(isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <button className="btn-secondary" onClick={() => setIsDark((v) => !v)}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
