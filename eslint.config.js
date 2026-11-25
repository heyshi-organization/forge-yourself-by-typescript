import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'lab-workspace/**',
      '.lab-work/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // reference用と starter用で tsconfig が別。どちらかに含まれるファイルを型情報つきでlintする
        project: ['./tsconfig.json', './tsconfig.starter.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Promiseを返すインターフェース(ポート)を同期処理で実装する場合があるため
      '@typescript-eslint/require-await': 'off',
      // AbortSignal.reason は any。abort理由をそのまま reject するのは正しい使い方
      '@typescript-eslint/prefer-promise-reject-errors': [
        'error',
        { allowThrowingAny: true, allowThrowingUnknown: true },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    // scripts はCLIなのでconsoleを許可する。型情報を使わない(JSなので)
    files: ['scripts/**/*.mjs', '*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-console': 'off' },
  },
  {
    // starterは学習者が書きかけの状態でもlintできるように、未使用だけ警告に下げる
    files: ['starter/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      // 「型を書いていない」暫定の any 由来の指摘は、型を書けば消えるので警告にとどめる
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
);
