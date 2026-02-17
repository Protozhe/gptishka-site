/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f5f7fb",
        ink: "#111827",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 14px 40px rgba(10, 18, 32, 0.09)",
      },
    },
  },
  plugins: [],
};
