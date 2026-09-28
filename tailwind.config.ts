import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 设计令牌（A 暗夜影院，docs/02 §2 / §7.3）：与 globals.css 的 CSS variables 同名映射
      colors: {
        bg: '#0B0E14',
        elevated: '#131822',
        overlay: '#1B2230',
        accent: '#E8112D',
        rating: '#F5C518',
        t1: '#F2F4F8',
        t2: '#9AA3B2',
        t3: '#5C6675',
      },
      borderRadius: {
        poster: '8px',
        card: '12px',
      },
      boxShadow: {
        glow: '0 0 0 2px rgba(232, 17, 45, 0.55), 0 8px 24px rgba(232, 17, 45, 0.25)',
        card: '0 24px 48px rgba(0, 0, 0, 0.4)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
