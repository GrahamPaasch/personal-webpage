import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const config = [
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
