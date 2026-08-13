import { requireNavRoute } from '@autoworkshop/next-shell';
import { StaffScreen } from '../../_screens/staff-screen';

/**
 * /settings/staff-and-roles — workshop staff, `07.txt` pt2 §50.
 *
 * ONE screen at TWO routes: the owner tree (§46) calls it Staff under Workshop
 * Management, the default tree (§34) calls it Staff and Roles under Settings.
 * Same screen, so there is one place to fix the next defect in.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx is
 * resolved ahead of the catch-all, so it carries no route check unless it makes
 * one (T-0005 finding 4). NOT the control — `MembershipService` gates granting
 * to CAN_GRANT_MEMBERSHIP roles and RLS scopes the reads underneath.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('workshop', '/settings/staff-and-roles');
  return <StaffScreen />;
}
