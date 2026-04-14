/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                hoff: {
                    bg: 'rgb(var(--hoff-bg) / <alpha-value>)',
                    surface: 'rgb(var(--hoff-surface) / <alpha-value>)',
                    elevated: 'rgb(var(--hoff-elevated) / <alpha-value>)',
                    brand: 'rgb(var(--hoff-brand) / <alpha-value>)',
                    accent: 'rgb(var(--hoff-accent) / <alpha-value>)',
                    'accent-muted': 'rgb(var(--hoff-accent-muted) / <alpha-value>)',
                    'accent-hover': 'rgb(var(--hoff-accent-hover) / <alpha-value>)',
                    'accent-fg': 'rgb(var(--hoff-accent-fg) / <alpha-value>)',
                    'text-primary': 'rgb(var(--hoff-text-primary) / <alpha-value>)',
                    'text-secondary': 'rgb(var(--hoff-text-secondary) / <alpha-value>)',
                    'text-tertiary': 'rgb(var(--hoff-text-tertiary) / <alpha-value>)',
                    // Feedback / status colors
                    warn: 'rgb(var(--hoff-warn) / <alpha-value>)',
                    'warn-muted': 'rgb(var(--hoff-warn-muted) / <alpha-value>)',
                    'warn-bg': 'rgb(var(--hoff-warn-bg) / <alpha-value>)',
                    err: 'rgb(var(--hoff-err) / <alpha-value>)',
                    'err-bg': 'rgb(var(--hoff-err-bg) / <alpha-value>)',
                    ok: 'rgb(var(--hoff-ok) / <alpha-value>)',
                    'ok-bg': 'rgb(var(--hoff-ok-bg) / <alpha-value>)',
                    info: 'rgb(var(--hoff-info) / <alpha-value>)',
                },
            },
        },
    },
    plugins: [],
};
