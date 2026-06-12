/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,ts}',
    './node_modules/flowbite/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        poppins: ['Poppins', 'sans-serif'],
        sans:    ['Poppins', 'sans-serif'],
      },
      colors: {
        // Primary: Deep Slate Blue #1E293B
        primary: {
          50:  '#f1f5f9',
          100: '#e2e8f0',
          200: '#cbd5e1',
          300: '#94a3b8',
          400: '#64748b',
          500: '#475569',
          600: '#334155',  // Secondary / Steel Blue
          700: '#1e293b',  // Primary base
          800: '#0f172a',
          900: '#020617',
          950: '#010409',
        },
        // Accent: Professional Cyan #0EA5E9
        accent: {
          50:      '#f0f9ff',
          100:     '#e0f2fe',
          200:     '#bae6fd',
          300:     '#7dd3fc',
          400:     '#38bdf8',
          DEFAULT: '#0ea5e9',
          600:     '#0284c7',
          700:     '#0369a1',
          800:     '#075985',
          900:     '#0c4a6e',
        },
        // Neutros fríos
        neutral: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        surface:    '#ffffff',
        background: '#f1f5f9',
        success:    '#10b981',
        warning:    '#f59e0b',
        danger:     '#ef4444',
      },
      boxShadow: {
        card:  '0 2px 16px 0 rgba(15, 23, 42, 0.08)',
        input: '0 1px 4px 0 rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        xl:   '1rem',
        '2xl':'1.25rem',
      },
    },
  },
  plugins: [
    require('flowbite/plugin'),
  ],
};
