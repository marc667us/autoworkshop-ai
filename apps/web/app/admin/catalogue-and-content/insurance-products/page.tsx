import { requireWorkspaceAccess } from '@autoworkshop/next-shell';
import { InsuranceReviewScreen } from '../../_screens/insurance-review-screen';

/**
 * /catalogue-and-content/insurance-products — slice 18.
 *
 * ⚠️ THIS ONE DID NEED A NAVIGATION CHANGE, unlike its parts sibling. The admin
 * tree's Catalogue and Content group carried Products and Content Moderation
 * and nothing for insurance, so the route was not advertised and the catch-all
 * rendered a placeholder. CLAUDE.md forbids changing approved navigation
 * without review; the entry is added under slice 18, which the task list scopes
 * as "the admin review-queue screen and the verification action", and the
 * reasoning is recorded beside the entry in `packages/navigation`.
 *
 * ⚠️ `requireWorkspaceAccess` FIRST, BEFORE ANY DATA ACCESS, and it is not the
 * layout's job. The admin layout gates `children` on `platform.admin`, but a
 * layout gate does NOT stop a page executing — the segment still renders and
 * its output ships in the RSC payload. That was measured here on 2026-07-28,
 * which is why every concrete admin page protects its own data as well.
 *
 * And neither is the control. The API re-checks `platform.admin` — which since
 * migrations 077/078 comes from a GRANT RECORD in
 * `identity.platform_administrators` rather than a membership role name, so a
 * revoked grant closes this route — and Postgres RLS denies independently of
 * both (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireWorkspaceAccess('admin', 'platform.admin');
  return <InsuranceReviewScreen />;
}
