const { join } = require('node:path');

module.exports = {
  content: [join(__dirname, 'index.html')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        handwriting: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: '#F98B88',
          'primary-dark': '#94504E',
          'primary-light': '#FFE3E2',
          'primary-soft': '#FFC7C5',
          bg: '#FFFDFC',
          card: '#FFFFFF',
          dark: '#2A1C1D',
          gray: '#514144',
          border: '#FFC7C5',
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
        '4xl': '2.25rem',
      },
      boxShadow: {
        soft: '0 10px 30px -8px rgba(249, 139, 136, 0.16), 0 4px 12px -2px rgba(174, 97, 95, 0.04)',
        'card-hover': '0 22px 45px -10px rgba(249, 139, 136, 0.28)',
        glow: '0 0 25px rgba(249, 139, 136, 0.35)',
      },
    },
  },
};
