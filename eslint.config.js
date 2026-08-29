import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'coverage/'],
  },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
);
