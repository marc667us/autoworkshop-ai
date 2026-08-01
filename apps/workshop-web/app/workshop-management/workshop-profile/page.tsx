import { requireNavRoute } from '@autoworkshop/next-shell';
import { DirectoryScreen } from '../../_screens/directory-screen';

/**
 * /workshop-management/workshop-profile — the owner's route.
 *
 * ⚠️ THE OWNER'S PATH. §46's owner navigation carries Workshop Profile under
 * Workshop Management; the §34 default tree carries it under Settings, and BOTH
 * are built — see the sibling page at `app/settings/workshop-profile`.
 *
 * An earlier version of this comment argued only this path was needed, because
 * migration 027 gives write access to `workshop_owner` alone. That was wrong:
 * `platform_administrator` may write too, and it resolves to the DEFAULT tree,
 * so omitting the other path left the administrator on a page that rendered
 * nothing. Slice 4 recorded this exact trap and it still caught me.
 *
 * NOT the control. `requireNavRoute` decides whether this ROUTE is offered;
 * migration 027's policy keys on the organization AND the role, and denies
 * independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/workshop-management/workshop-profile');
  return <DirectoryScreen />;
}
