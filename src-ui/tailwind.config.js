/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '13': 'repeat(13, minmax(0, 1fr))',
      },
      colors: {
        background: "#0c0d12",
        surface: "#141721",
        surfaceBorder: "#232838",
        accent: "#6366f1",
        accentHover: "#4f46e5",
        stemDrums: "#f43f5e",
        stemBass: "#eab308",
        stemOther: "#06b6d4",
        stemVocals: "#a855f7"
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    },
  },
  plugins: [],
}
