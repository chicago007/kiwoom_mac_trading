import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b12",
          900: "#0d1420",
          800: "#141c2b",
          700: "#1c2738",
          600: "#243044",
        },
        cream: {
          50: "#e8eef6",
          100: "#c5ced9",
          300: "#8b98a8",
          500: "#6b7785",
        },
        brass: {
          400: "#f0b429",
          500: "#e09a14",
        },
        up: "#ff4d4d",
        down: "#4d8bff",
      },
      fontFamily: {
        sans: ["Pretendard", "Apple SD Gothic Neo", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
        sm: ["1rem", { lineHeight: "1.5rem" }],
        base: ["1.125rem", { lineHeight: "1.75rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        xl: ["1.375rem", { lineHeight: "1.875rem" }],
        "2xl": ["1.625rem", { lineHeight: "2.125rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
