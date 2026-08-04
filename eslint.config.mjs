import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
  {
    name: 'project/ignores',
    // Built artifacts and vendored bundles. Linting these is pure noise (and
    // slow — Babel deoptimises on the multi-hundred-KB Phaser bundle).
    ignores: [
      '.next/**',
      'public/**',
      'games/*/dist/**',
      'games/*/node_modules/**',
      'automation/**',
      'agent-callback-gateway/**',
    ],
  },
  ...nextCoreWebVitals,
  {
    name: 'project/overrides',
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      '@next/next/no-img-element': 'error',
      'react/no-unescaped-entities': 'off',
      'react/jsx-first-prop-new-line': ['error', 'multiline-multiprop'],
      'react/jsx-max-props-per-line': ['error', { when: 'multiline' }],
    },
  },
];

export default config;
