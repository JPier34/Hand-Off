/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hoff: {
          bg:             '#0D1818',
          surface:        '#152828',
          elevated:       '#1E3535',
          brand:          '#203232',
          accent:         '#2EBF7A',
          'accent-muted': '#1A4A3A',
          'accent-hover': '#25A068',
          'text-primary': '#FFFFFF',
          'text-secondary': '#7FA8A8',
          'text-tertiary':  '#6C9191',
        },
      },
    },
  },
  plugins: [],
}
