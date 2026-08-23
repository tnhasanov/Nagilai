import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint flat config.
 *
 * `eslint-config-next` ships flat configs directly from v16, so there is
 * no FlatCompat shim here.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      // Generated from the database schema.
      'src/types/database.ts',
      // Service worker: runs in a worker global scope, not the app's.
      'public/sw.js',
      // The native app is a separate project with its own toolchain.
      'mobile/**',
    ],
  },
  {
    rules: {
      // The generated Supabase client returns `any` in a few union
      // positions; the code narrows those deliberately.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default eslintConfig;
