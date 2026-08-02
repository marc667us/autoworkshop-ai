// Metro's configuration for a package inside a pnpm workspace.
//
// 🔴 WITHOUT THIS FILE THE APP DOES NOT BUNDLE AT ALL. Metro's defaults assume
// the project is its own root with a flat `node_modules` beside it. Neither
// holds here: this app lives at `apps/mobile` and pnpm links dependencies
// through `node_modules/.pnpm` at the workspace root. Started without it,
// Metro resolved the entry point relative to the MONOREPO root and failed with
// "Unable to resolve module ./index from <repo>/." — after spending eight
// minutes crawling every package in the workspace first.
//
// It went unnoticed because the mobile app had never been bundled: `vitest`
// exercises the auth helpers as plain modules, and `expo start` reports
// "Waiting on http://localhost:8081" without building anything. Metro running
// is not the same as the app building — the bundle has to be REQUESTED before
// any of this surfaces.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Source outside this package still has to be watched, or an edit to a shared
// workspace package would never trigger a reload.
config.watchFolders = [workspaceRoot];

// Both locations, in this order: pnpm puts a package's own dependencies in its
// local `node_modules` and the hoisted remainder at the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 🔴 `disableHierarchicalLookup` IS DELIBERATELY LEFT ON (i.e. NOT set to true),
// AND THAT IS THE OPPOSITE OF WHAT EXPO'S MONOREPO GUIDE SAYS. The guide is
// written for npm and yarn workspaces, where every dependency is hoisted into
// one flat root `node_modules` and walking up the tree can only find the wrong
// copy of something.
//
// pnpm is built the other way round. A package's own dependencies live NEXT TO
// IT inside `node_modules/.pnpm/<pkg>@<version>/node_modules/`, and the only
// thing that finds them is the walk-up lookup. Setting it to true here broke
// react-native's resolution of its own `invariant` — the bundle failed inside
// react-native/index.js, a file nothing in this repo controls, which reads like
// a corrupt install rather than a config mistake.
//
// Do not "restore" this line from the Expo docs without re-requesting a bundle.

module.exports = config;
