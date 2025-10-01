import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7e6",
          100: "#feebc8",
          200: "#fcd88a",
          300: "#f6c14a",
          400: "#f0a718",
          500: "#d48807",
          600: "#a96a05",
          700: "#7e4d05",
          800: "#553404",
          900: "#2e1b02"
        }
      }
    }
  },
  plugins: []
};

export default config;
