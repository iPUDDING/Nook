import type { Config } from "tailwindcss";

/**
 * Tokens derivados del análisis (ver ANALISIS.md):
 *  - Neutros de la app:  #FFFFFF / #37352F / rgba(55,53,47,α)
 *  - Sidebar:            #F7F7F5
 *  - Paleta de texto y highlights: escala de 10 colores
 *  - Tipografía:         system-ui / -apple-system (SF Pro), pesos 500/600/650
 *  - Radios:             4 / 6 / 8 / round  (escala `--tatami-border-radius-*`)
 *
 * Todo se expone como variables CSS en globals.css para poder tener dark mode
 * sin duplicar clases en cada componente.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          soft: "rgb(var(--fg-soft) / <alpha-value>)",
          muted: "rgb(var(--fg-muted) / <alpha-value>)",
          faint: "rgb(var(--fg-faint) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          side: "rgb(var(--surface-side) / <alpha-value>)",
          hover: "rgb(var(--surface-hover) / <alpha-value>)",
          active: "rgb(var(--surface-active) / <alpha-value>)",
          pop: "rgb(var(--surface-pop) / <alpha-value>)",
        },
        line: "rgb(var(--line) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        notion: {
          gray: "#787774",
          brown: "#9F6B53",
          orange: "#D9730D",
          yellow: "#CB912F",
          green: "#448361",
          blue: "#337EA9",
          purple: "#9065B0",
          pink: "#C14C8A",
          red: "#D44C47",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Apple Color Emoji",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        app: "6px",
        pop: "8px",
      },
      boxShadow: {
        menu: "0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2)",
        pop: "0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2)",
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.97) translateY(-2px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "pop-in": "pop-in 120ms ease-out",
        "fade-in": "fade-in 120ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
