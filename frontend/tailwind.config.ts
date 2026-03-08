import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FAFAF8',
        ink: '#1A1A1A',
        rule: '#E4E2DC',
        'rule-strong': '#D1CFC8',
        accent: '#1B4FD8',
        'accent-bg': '#EEF2FF',
        'accent-dim': '#3B64DD',
        'text-2': '#6B6B6B',
        'text-3': '#A8A49E',
        'priority-high': '#C1341A',
        'priority-medium': '#A07020',
        'priority-low': '#1B7A4A',
        'priority-high-bg': '#FEF2F0',
        'priority-medium-bg': '#FEF6E7',
        'priority-low-bg': '#ECF6F2',
        'done': '#6B9E6B',
        'done-bg': '#F0F5F0',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '3px',
        lg: '4px',
      },
      boxShadow: {
        overlay: '0 4px 16px rgba(26, 26, 26, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
