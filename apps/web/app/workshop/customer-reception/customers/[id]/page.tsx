import { requireNavRoute } from '@autoworkshop/next-shell';
import { CustomerDetailScreen } from '../../../_screens/customer-detail-screen';

/**
 * /customer-reception/customers/<id> — detail, on the §34 default tree.
 *
 * ⚠️ GATED ON THE PARENT LIST ROUTE, not on this one. A detail route is DYNAMIC
 * and no navigation advertises one entry per record, so "is `/customer-reception/customers/<id>`
 * in your menu" has no sensible answer. The real question is whether this viewer
 * may see the LIST, and a viewer refused the list is refused every record
 * reachable from it. `check-page-gates.sh` strips trailing dynamic segments and
 * enforces exactly that.
 *
 * NOT the record-level check. The service re-verifies role, tenant AND
 * organization and answers 404 for a record outside them, so guessing an id
 * yields nothing (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('workshop', '/customer-reception/customers');
  const { id } = await params;
  return <CustomerDetailScreen id={id} listHref="/customer-reception/customers" />;
}
