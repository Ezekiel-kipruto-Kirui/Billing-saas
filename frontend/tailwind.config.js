/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#f8fafc',
          navy: '#1a2744',
          navySoft: '#223456',
          accent: '#2d4a8a',
          accentDark: '#243c72',
        },
        sidebar: '#1a2744',
      },
      boxShadow: {
        soft: 'none',
      },
    },
  },
  plugins: [],
};
