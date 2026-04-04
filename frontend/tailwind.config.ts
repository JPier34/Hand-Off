import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9",
          600: "#0284c7", 700: "#0369a1",
        },
        surface: { DEFAULT: "#0f172a", card: "#1e293b", border: "#334155" },
        accent:  { DEFAULT: "#6366f1", hover: "#4f46e5" },
        success: "#22c55e", warning: "#f59e0b", danger: "#ef4444",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
      },
      animation: {
        "fade-in":  "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
