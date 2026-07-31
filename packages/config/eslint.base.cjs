/** Shared ESLint base. Architecture boundaries are additionally enforced in CI. */
module.exports = {
  root: false,
  env: { es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', '.next', 'node_modules', 'coverage'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    /**
     * ⚠️ `ignoreRestSiblings` IS NOT LENIENCY — IT IS WHAT MAKES A DELIBERATE
     * OMISSION EXPRESSIBLE.
     *
     * `const { roleGroups: _resolved, ...rest } = workspace` in
     * `packages/navigation/src/resolve.ts` exists to DROP a field: a resolved
     * navigation view must not carry the alternatives it was chosen from, or
     * the nav/router divergence that design prevents comes back. The binding is
     * unused ON PURPOSE — that is the whole mechanism.
     *
     * Without this option the only ways to satisfy the rule are to delete the
     * omission (reintroducing the bug) or to bolt on a file-level disable
     * (which would also hide REAL unused variables in the same file). The
     * option targets exactly the omit-via-rest pattern and nothing else.
     *
     * `argsIgnorePattern` alone did not cover it: it applies to ARGUMENTS, not
     * to destructured variables, which is why the `_` prefix read as intent to
     * a human and as a defect to eslint.
     */
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
