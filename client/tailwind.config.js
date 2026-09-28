/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#070a13',
          card: '#0c1222',
          surface: '#121b30',
          border: 'rgba(56, 189, 248, 0.15)',
          cyan: '#06b6d4',
          glow: '#22d3ee',
          neon: '#00f2fe'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'cyber-cyan': '0 0 25px -5px rgba(6, 182, 212, 0.35)',
        'cyber-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.35)',
        'glass': '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 3s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: 0.4 },
          '100%': { opacity: 0.8 },
        }
      }
    },
  },
  plugins: [],
}
