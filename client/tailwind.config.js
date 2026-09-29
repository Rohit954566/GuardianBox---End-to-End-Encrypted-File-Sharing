/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: {
          950: '#060a14',
          900: '#0a0f1a',
          850: '#0e1525',
          800: '#121c30',
          700: '#1a2744',
          600: '#233456'
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'cyber-cyan': '0 0 30px -5px rgba(6, 182, 212, 0.3)',
        'cyber-teal': '0 0 30px -5px rgba(20, 184, 166, 0.3)',
        'cyber-emerald': '0 0 25px -5px rgba(16, 185, 129, 0.25)',
        'glass': '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      },
      animation: {
        'pulse-slow': 'pulse 5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
