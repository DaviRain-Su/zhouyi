import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        gold: {
          50: "#fdf8e8",
          100: "#f9edc5",
          200: "#f2d88b",
          300: "#e8bf4f",
          400: "#d4a843",
          500: "#b8860b",
          600: "#9a6f09",
          700: "#7c5807",
          800: "#5e4205",
          900: "#402c03",
        },
        ink: {
          50: "#f5f5f5",
          100: "#e8e8e8",
          200: "#d1d1d1",
          300: "#a3a3a3",
          400: "#737373",
          500: "#4a4a4a",
          600: "#2d2d2d",
          700: "#1f1f1f",
          800: "#141414",
          900: "#0a0a0a",
        },
      },
      fontFamily: {
        han: ["'Noto Serif SC'", "'Source Han Serif SC'", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
