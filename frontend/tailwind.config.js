export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        4.5: '1.125rem',
        18: '4.5rem',
      },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontSize: {
        'metric': ['2rem', { lineHeight: '1.15', fontWeight: '700' }],
        'metric-sm': ['1.25rem', { lineHeight: '1.25', fontWeight: '600' }],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card-dark': '0 1px 3px 0 rgb(0 0 0 / 0.35)',
      },
    },
  },
  plugins: [],
};
