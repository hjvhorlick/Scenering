/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        /**
         * The single neutral dividing line used across the UI.
         * Translucent, so it sits softly on any dark surface and keeps
         * borders reading as fine lines rather than chunky gray frames.
         * (Barse `border-hairline`; opacity modifiers intentionally
         * unneeded — use the token as-is.)
         */
        hairline: "var(--hairline)",
      },
      screens: {
        /**
         * Small-phone breakpoint. Tailwind's smallest default is `sm` at
         * 640px, which leaves everything from 320px to 639px sharing one
         * layout — too wide a range for this app's dense control panels.
         * `xs` lets a 360px phone drop labels and stack columns that a
         * 480px phone can still show.
         *
         * Kept in sync with BREAKPOINTS in src/lib/use-breakpoint.ts.
         */
        xs: "420px",
      },
    },
  },
  plugins: [],
};
