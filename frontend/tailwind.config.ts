import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#ebfff5",
          100: "#d4ffe9",
          200: "#a9f7cf",
          300: "#7de9b3",
          400: "#46d78f",
          500: "#18bb70",
          600: "#0d9558",
          700: "#0a7346",
          800: "#0a5938",
          900: "#08472e"
        }
      }
    }
  },
  plugins: []
};

export default config;
