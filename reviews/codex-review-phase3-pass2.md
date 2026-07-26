**Findings**

- **P1** [AppShell.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/AppShell.tsx:255): the AI assistant `Drawer` is rendered after the main flex row closes, but its non-modal variant returns a sticky `<aside>` [Drawer.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/Drawer.tsx:134). On desktop, `modal={isMobile}` is false, so the assistant becomes a block below the shell content instead of a right-side panel beside the page. Move this drawer into the row that contains `main`, or make non-modal drawers position/flex relative to the shell layout.

- **P2** [useFocusTrap.ts](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/useFocusTrap.ts:105): the focus-trap effect depends on `onClose`, while callers pass inline callbacks at [AppShell.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/AppShell.tsx:200) and [AppShell.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/AppShell.tsx:257). Any parent re-render while a drawer is open recreates the trap, restores focus to the opener, then focuses the first element again. That can steal focus during interaction. Store `onClose` in a ref inside the hook or memoize the close handlers.

- **P2** [TopNav.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/TopNav.tsx:297): the mobile breakpoint only hides the selector cluster [TopNav.tsx](/c:/Users/USER/Documents/autoworkshop-ai/packages/ui/src/TopNav.tsx:342), but all global actions, the theme control, user label, brand, menu button, and search remain in one non-wrapping header. At 360px this will overflow or collapse the search to near-zero width. The right action cluster needs a mobile treatment, such as moving secondary actions into a menu/drawer.

**Verification**

I attempted the targeted `pnpm --filter ... test` and `typecheck` commands, but this session’s policy rejected `pnpm` execution. Static review only.
