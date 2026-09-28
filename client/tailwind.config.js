/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hud: {
          void: "#03070d",
          bg: "#050d18",
          surface: "#091728",
          surfaceLight: "#0e2238",
          glass: "rgba(6, 17, 30, 0.8)",
          cyan: "#00f0ff",
          cyanHover: "#38bdf8",
          cyanDim: "#0284c7",
          cyanGlow: "rgba(0, 240, 255, 0.3)",
          cyanBorder: "rgba(0, 240, 255, 0.22)",
          text: "var(--text-bright)",
          textMuted: "var(--text-muted)",
          textDark: "#334455",
        }
      },
      fontFamily: {
        sans: ['ArtifaktElement', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"SF Mono"', 'Monaco', 'Inconsolata', '"Fira Code"', 'monospace'],
      }
    },
  },
  plugins: [],
}
