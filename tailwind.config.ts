import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        paper: 'var(--paper)',
        slate: 'var(--slate)',
        neon: 'var(--neon)',
        magnet: 'var(--magnet)',
        ultra: 'var(--ultra)',
        mint: 'var(--mint)',
      },
      fontFamily: {
        unified: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ai: ['Oxanium', 'JetBrains Mono', 'monospace'],
        human: ['Crimson Pro', 'serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [
    typography,
    function ({ addUtilities }) {
      addUtilities(
        {
          '.mono': {
            fontFamily: '"DM Mono", var(--font-voice-ai-mono, "DM Mono"), monospace',
            fontVariantNumeric: 'tabular-nums',
            fontFeatureSettings: '"tnum" 1, "zero" 1',
          },
        },
        { variants: ['responsive'] },
      );
    },
  ],
};

export default config;
