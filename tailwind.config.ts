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
        unified: ['var(--voice-unified)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        ai: ['var(--voice-ai-mono)', 'JetBrains Mono', 'Courier New', 'Consolas', 'monospace'],
        human: ['var(--voice-human)', 'var(--voice-human-text)', 'Georgia', 'serif'],
        mono: ['var(--voice-dm)', 'var(--voice-ai-mono)', 'monospace'],
      },
    },
  },
  plugins: [
    typography,
    function ({ addUtilities }) {
      addUtilities(
        {
          '.mono': {
            fontFamily: 'var(--voice-dm), var(--voice-ai-mono), monospace',
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
