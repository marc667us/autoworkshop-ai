import { requireNavRoute } from '@autoworkshop/next-shell';
import { MyWarrantyClaimsScreen } from '../../../_screens/my-warranty-claims-screen';

/**
 * /parts-and-warranty/warranty-claims — `01 (1).txt` §33, the customer workspace.
 *
 * Slice 12: this was a signpost until the customer could reach their own
 * records. It is a real screen now — see `my-warranty-claims-screen.tsx`.
 *
 * `requireNavRoute` RESOLVES THE PATH AGAINST THE VIEWER'S VISIBLE NAVIGATION.
 * It is not authentication: the §33 tree has no per-role variants, so a
 * signed-out visitor reaches the page, `apiGet` finds no token and the screen
 * renders its unauthenticated state. The refusal that matters is in the API —
 * `resolveCustomerId` derives the customer from the SESSION and never accepts
 * one from the caller.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('customer', '/parts-and-warranty/warranty-claims');
  return <MyWarrantyClaimsScreen />;
}
