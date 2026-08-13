import { requireNavRoute } from '@autoworkshop/next-shell';
import { DirectoryScreen } from '../../_screens/directory-screen';

/**
 * /settings/workshop-profile — the §34 DEFAULT tree's route to the same screen.
 *
 * ⚠️ BOTH PATHS ARE REQUIRED, AND ASSUMING OTHERWISE COST A RUN. §46's owner
 * navigation carries Workshop Profile under Workshop Management; the §34 default
 * tree carries it under Settings. The reflex was to build only the owner's path
 * because only an owner may EDIT — but `platform_administrator` may edit too,
 * and `navRoleFor('platform_administrator')` returns undefined, which resolves
 * to the DEFAULT tree. So the administrator's route is this one, and building
 * only the other left them with a page that rendered nothing.
 *
 * Slice 4 wrote down exactly this trap — "re-check the file rather than trusting
 * this table" — and it was still the first thing to go wrong here.
 *
 * Everyone else reaching this route sees the listing READ-ONLY: the form renders
 * disabled and names the owner, which is more useful than hiding it. Migration
 * 027's policy is what actually refuses their writes.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/settings/workshop-profile');
  return <DirectoryScreen />;
}
