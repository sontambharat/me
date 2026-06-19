import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Driven by CSS variables so a site's theme can recolor the product UI
        // and the rendered canvas at runtime.
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          fg: 'rgb(var(--brand-fg) / <alpha-value>)',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 10px 30px -12px rgb(15 23 42 / 0.25)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
};

export default config;
