/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        stone: {
          50: '#F4F7FC',
          100: '#E9EEF7',
          200: '#D8E1F0',
        },
        slate: {
          850: '#0B3FAE',
          900: '#082C7D',
        },
        ink: '#1B2333',
        patina: {
          50: '#E7F1FD',
          100: '#C9E1FB',
          400: '#5AA0F0',
          500: '#2C82E6',
          600: '#1E68C2',
          700: '#154E96',
        },
        brick: {
          50: '#FBEAE7',
          400: '#C24B3F',
          500: '#B23B3B',
          600: '#8F2E2E',
        },
        amber: {
          50: '#FFF6DC',
          400: '#FFD54F',
          500: '#FFC200',
          600: '#D6A300',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
