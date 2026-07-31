/**
 * Real linting, replacing a `"lint": "echo ok"` script that ran NOTHING while
 * contributing a green tick to `pnpm -r lint`.
 *
 * The shared base is `@autoworkshop/config`, which MUST be declared in this
 * package's devDependencies — pnpm links only declared workspace deps, and an
 * undeclared one makes eslint die before reading a single rule. That exact
 * omission hid this gap in `apps/api` since Release 0.1.
 */
module.exports = {
  root: true,
  ...require('@autoworkshop/config/eslint.base.cjs'),
};
