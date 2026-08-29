import base from '@acs/eslint-config';

export default [
  {
    ignores: ['dist/**', 'coverage/**', '*.mjs'],
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
