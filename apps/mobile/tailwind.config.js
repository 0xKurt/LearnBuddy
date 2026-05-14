// LearnBuddy design tokens. Ported from the handoff bundle (components.jsx LB).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1d1b22',
          2: '#5c5764',
          3: '#928d9c',
          4: '#cfcbd5',
        },
        paper: '#fdfcfa',
        bg: '#f6f3ee',
        canvas: '#f0eee9',
        hairline: 'rgba(20,15,30,0.08)',
        primary: {
          DEFAULT: '#b1715c',
          dark: '#985d4b',
          light: '#f4dccf',
        },
        success: '#6b8d6a',
        warning: '#b58a3c',
        danger: '#b1493c',
        // Subject pastels
        lavender: '#ebe4f4',
        'lavender-deep': '#cdbde6',
        peach: '#f8e0d2',
        'peach-deep': '#ecc2a8',
        mint: '#dceee2',
        'mint-deep': '#b9d8c4',
        blush: '#f2dde2',
        'blush-deep': '#e2bbc6',
        sky: '#dce6ef',
        'sky-deep': '#b8cee0',
        butter: '#f3e8cf',
        'butter-deep': '#ddc995',
        rose: '#dcd4e4',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrainsMono', 'monospace'],
      },
      borderRadius: {
        card: '18px',
        btn: '12px',
        phone: '40px',
      },
    },
  },
  plugins: [],
};
