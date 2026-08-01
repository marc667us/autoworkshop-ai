import { requireNavRoute } from '@autoworkshop/next-shell';
import { SupplierCatalogueScreen } from '../../_screens/supplier-catalogue-screen';

/**
 * /products/product-catalogue — the supplier's own parts.
 *
 * ⚠️ NO NAVIGATION CHANGE WAS NEEDED. The §35 supplier tree already carries a
 * Products group with Product Catalogue, Add Product, Bulk Upload and Draft
 * Products — the approved navigation anticipated this screen, and CLAUDE.md
 * forbids changing approved navigation without review. This replaces the
 * catch-all placeholder that `app/[...slug]/page.tsx` was rendering here; Next
 * resolves a concrete page ahead of the catch-all.
 *
 * ⚠️ ONE SCREEN COVERS ADD, EDIT AND DRAFTS, and the sibling nav items are
 * still placeholders. Deliberate, and the same reasoning the order inbox
 * records: splitting a short list across four routes makes a supplier hunt for
 * a part by guessing its state, and the state is what they came to change. Add
 * Product is a form at the top of this page; Draft Products is a badge on each
 * row. Bulk Upload is genuinely not built. Named here so the remaining
 * placeholders are not read as a defect.
 *
 * NOT the control. `requireNavRoute` decides whether this ROUTE is offered to
 * this viewer; the API's `UserGuard`, migration 024's policies and its triggers
 * decide what may actually be read and written, independently (CLAUDE.md §8).
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS.
  await requireNavRoute('supplier', '/products/product-catalogue');
  return <SupplierCatalogueScreen />;
}
