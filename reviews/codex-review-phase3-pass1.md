**Findings**

- **High:** Permission-gated routes are still directly renderable through the catch-all page. [ModulePage.tsx](/C:/Users/USER/Documents/autoworkshop-ai/packages/next-shell/src/ModulePage.tsx:29) checks `workspace.groups` directly, while visibility filtering only happens in the client shell via `visibleGroups`. That means a hidden item such as a finance/admin route can still render the “not built yet” page by URL. If this shell is meant to enforce permission-aware routing, `renderModulePage` needs the same grant-filtered tree or a server-side guard.

- **Medium:** The staged commit and current working tree are out of sync. `packages/ui/src/index.ts` and `packages/ui/package.json` have unstaged fixes, while `Tabs`, `Dialog`, `Drawer`, `AiAssistantPanel`, hooks, and `vitest.config.ts` are still untracked. A staged-only commit will omit those additions. Either stage the full current UI surface or keep the staged diff isolated.

- **Medium:** Several top-nav controls are focusable but have no behavior. [TopNav.tsx](/C:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/TopNav.tsx:195) renders workspace/org/branch/user selectors without handlers, and all app layouts pass `topNavActions` without `onSelect` callbacks, for example [layout.tsx](/C:/Users/USER/Documents/autoworkshop-ai/apps/workshop-web/app/layout.tsx:43). Keyboard and screen-reader users get actionable buttons that do nothing.

**Verification**

I could not run `pnpm` typecheck/test commands because the sandbox policy rejected those executions.
