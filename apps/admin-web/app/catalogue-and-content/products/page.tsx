import { requireWorkspaceAccess } from '@autoworkshop/next-shell';
import { CatalogueReviewScreen } from '../../_screens/catalogue-review-screen';

/**
 * /catalogue-and-content/products — the marketplace review queue.
 *
 * ⚠️ NO NAVIGATION CHANGE WAS NEEDED. The admin tree's Catalogue and Content
 * group already carries Products, gated on `platform.admin`. CLAUDE.md forbids
 * changing approved navigation without review, so this fills a route the
 * approved model already advertised and that the catch-all was rendering as a
 * placeholder.
 *
 * ⚠️ `requireWorkspaceAccess` FIRST, BEFORE ANY DATA ACCESS, and it is not the
 * layout's job. `apps/admin-web/app/layout.tsx` gates `children` on
 * `platform.admin`, but a layout gate does NOT stop a page executing — the
 * segment still renders and ships in the RSC payload. That was measured in this
 * repository on 2026-07-28 and is why every concrete admin page protects its own
 * data as well.
 *
 * And neither is the control. The API re-checks the administrator role, and
 * migration 025's policies deny independently of both (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireWorkspaceAccess('admin', 'platform.admin');
  return <CatalogueReviewScreen />;
}
