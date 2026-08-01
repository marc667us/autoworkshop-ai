import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { AddPartForm, DeletePartButton, FitmentEditor } from './catalogue-controls';

/**
 * The supplier's own catalogue — Slice B, and the screen that ends "nothing can
 * publish a catalogue row except the seed script".
 *
 * ⚠️ EVERY PART IN THE MARKETPLACE UNTIL TODAY WAS INSERTED BY A SHELL SCRIPT.
 * That was the actual blocker recorded in the 07-30 outstanding list, and it had
 * two halves: no screen, and — found while building this one — no working write
 * path for an administrator either, because every admin policy in migrations
 * 021-024 tested a role name the application never sets (fixed in 025).
 *
 * ⚠️ THE PUBLICATION STATE IS SHOWN ON EVERY ROW, DELIBERATELY. A supplier who
 * cannot tell which of their parts a buyer can actually see has no way to
 * understand why one sells and another does not. `StatusBadge` carries it, and
 * the draft/live distinction is the single most important thing on this page.
 *
 * NOT the control. `UserGuard` authenticates, migration 024's policies scope the
 * rows to this supplier's active members, and its triggers decide which columns
 * may change — all independently of anything here (CLAUDE.md §8).
 */

export const dynamic = 'force-dynamic';

interface SupplierRow {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  isVerified: boolean;
  memberRole: string;
  partCount?: number;
  publishedPartCount?: number;
}

interface PartRow {
  id: string;
  partNumber: string;
  name: string;
  brand: string | null;
  price: number | null;
  currency: string;
  inStock: boolean;
  isPublished: boolean;
  categoryName?: string;
  fitmentCount?: number;
}

interface FitmentRow {
  id: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number | null;
}

function money(price: number | null, currency: string): string {
  if (price === null) return 'Quote only';
  return `${currency} ${price.toFixed(2)}`;
}

export function SupplierCatalogueScreen() {
  return (
    <>
      <PageHeader
        title="Product catalogue"
        description="The parts you list in the marketplace. Add and edit them here; an administrator reviews and publishes them before buyers can see them."
      />
      <Suspense fallback={<LoadingState label="Loading your catalogue…" />}>
        <CatalogueBody />
      </Suspense>
    </>
  );
}

async function CatalogueBody() {
  const suppliers = await apiGet<SupplierRow[]>('supplier', '/catalogue/suppliers');
  if (!suppliers.ok) return <ApiFailure reason={suppliers.reason} workspaceId="supplier" />;

  if (suppliers.data.length === 0) {
    /**
     * ⚠️ THE EMPTY STATE IS A ROUTE, NOT AN APOLOGY. A signed-in user with no
     * supplier is the normal starting point, not an error — the marketplace is
     * meant to grow by people applying. Saying only "no suppliers" would leave
     * them with nowhere to go, which is the same dead end as a refusal that
     * names no alternative.
     */
    return (
      <EmptyState
        title="You do not list any parts yet"
        description="Apply to be listed as a supplier and you can start adding parts straight away. Nothing you add is visible to buyers until an administrator publishes it."
      />
    );
  }

  const categories = await apiGet<Array<{ id: string; name: string }>>(
    'supplier',
    '/catalogue/categories',
  );

  return (
    <>
      {suppliers.data.map((s) => (
        <SupplierPanel
          key={s.id}
          supplier={s}
          categories={categories.ok ? categories.data : []}
        />
      ))}
    </>
  );
}

async function SupplierPanel({
  supplier,
  categories,
}: {
  supplier: SupplierRow;
  categories: Array<{ id: string; name: string }>;
}) {
  const parts = await apiGet<PartRow[]>('supplier', `/catalogue/suppliers/${supplier.id}/parts`);

  return (
    <section
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        padding: primitive.space[4],
        marginBottom: primitive.space[4],
        background: themeVar.backgroundSecondary,
      }}
    >
      <header style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg }}>{supplier.name}</h2>
        <StatusBadge kind={supplier.isPublished ? 'complete' : 'draft'} label={supplier.isPublished ? 'Listed publicly' : 'Awaiting review'} />
        {supplier.isVerified && <StatusBadge kind="active" label="Verified" />}
      </header>

      {!supplier.isPublished && (
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          An administrator has not published this listing yet. You can add parts
          now — they are reviewed together with the listing.
        </p>
      )}

      <AddPartForm supplierId={supplier.id} categories={categories} />

      {!parts.ok ? (
        <ApiFailure reason={parts.reason} workspaceId="supplier" />
      ) : parts.data.length === 0 ? (
        <EmptyState
          title="No parts yet"
          description="Add your first part above. Buyers search by car make, model and year, so add the vehicles each part fits once it is saved."
        />
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: `${primitive.space[4]} 0 0` }}>
          {parts.data.map((p) => (
            <PartRowView key={p.id} part={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function PartRowView({ part }: { part: PartRow }) {
  const fitments = await apiGet<FitmentRow[]>('supplier', `/catalogue/parts/${part.id}/fitments`);

  return (
    <li
      style={{
        borderTop: `1px solid ${themeVar.borderDefault}`,
        padding: `${primitive.space[3]} 0`,
      }}
    >
      <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{part.name}</strong>
        <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          {part.partNumber}
          {part.brand ? ` · ${part.brand}` : ''}
          {part.categoryName ? ` · ${part.categoryName}` : ''}
        </span>
        <span>{money(part.price, part.currency)}</span>
        {/* The distinction that matters most on this page. */}
        <StatusBadge kind={part.isPublished ? 'complete' : 'draft'} label={part.isPublished ? 'Live' : 'Draft'} />
        {!part.inStock && <StatusBadge kind="blocked" label="Out of stock" />}
        {!part.isPublished && <DeletePartButton partId={part.id} partName={part.name} />}
      </div>

      {fitments.ok ? (
        <FitmentEditor partId={part.id} published={part.isPublished} fitments={fitments.data} />
      ) : (
        <ApiFailure reason={fitments.reason} workspaceId="supplier" />
      )}
    </li>
  );
}
