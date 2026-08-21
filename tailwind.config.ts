import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1c2522",
        cream: "#f6f3ed",
        sage: "#dbe8df",
        moss: "#315c4b",
        terracotta: "#c66a4b"
      }
    }
  },
  plugins: []
};

export default config;
