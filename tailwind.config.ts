import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 8px 30px rgba(17, 24, 39, 0.10)"
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      keyframes: {
        "card-highlight": {
          "0%": { boxShadow: "0 0 0 2px rgba(59,130,246,0.5), 0 0 12px rgba(59,130,246,0.15)" },
          "50%": { boxShadow: "0 0 0 3px rgba(59,130,246,0.35), 0 0 18px rgba(59,130,246,0.1)" },
          "100%": { boxShadow: "0 0 0 0px rgba(59,130,246,0), 0 0 0px rgba(59,130,246,0)" }
        }
      },
      animation: {
        "card-highlight": "card-highlight 2s ease-out"
      }
    }
  },
  plugins: []
} satisfies Config;
