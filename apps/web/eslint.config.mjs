import base from '@acs/eslint-config';

export default [
  {
    ignores: ['.next/**', 'coverage/**', 'next-env.d.ts', '*.mjs'],
  },
  ...base,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
