import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { PartDecision, SupplierDecision } from './catalogue-review-controls';

/**
 * The catalogue review queue — the administrator's half of Slice B.
 *
 * ⚠️ THIS SCREEN IS THE ONLY WAY ANYTHING REACHES THE PUBLIC MARKETPLACE.
 * Migration 024 gives suppliers full control of their own drafts and no route to
 * publication; this is where that decision is made. Until it existed, the answer
 * to "how does a part become visible" was "a developer runs a shell script".
 *
 * ⚠️ AN EMPTY QUEUE IS AMBIGUOUS AND IS LABELLED AS SUCH. Nothing awaiting
 * review looks identical to a request that returned nothing because the viewer's
 * role is not recognised — which is precisely the failure migration 025 fixed,
 * and it produced no error for four migrations. The empty state therefore says
 * what it means rather than "All done".
 */

export const dynamic = 'force-dynamic';

interface QueueSupplier {
  id: string;
  slug: string;
  name: string;
  country: string;
  city: string | null;
  website: string | null;
  isPublished: boolean;
  isVerified: boolean;
  createdAt?: string;
}

interface QueuePart {
  id: string;
  partNumber: string;
  name: string;
  brand: string | null;
  price: number | null;
  currency: string;
  isPublished: boolean;
  supplierName?: string;
  supplierPublished?: boolean;
}

function money(price: number | null, currency: string): string {
  if (price === null) return 'Quote only';
  return `${currency} ${price.toFixed(2)}`;
}

export function CatalogueReviewScreen() {
  return (
    <>
      <PageHeader
        title="Catalogue review"
        description="Supplier listings and parts waiting to appear in the public marketplace. Nothing here is visible to buyers until it is published."
      />
      <Suspense fallback={<LoadingState label="Loading the review queue…" />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  const queue = await apiGet<{ suppliers: QueueSupplier[]; parts: QueuePart[] }>(
    'admin',
    '/admin/catalogue/review-queue',
  );
  if (!queue.ok) return <ApiFailure reason={queue.reason} workspaceId="admin" />;

  const { suppliers, parts } = queue.data;

  if (suppliers.length === 0 && parts.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting for review"
        description="Every supplier listing and part has had a decision. New applications and new draft parts appear here automatically."
      />
    );
  }

  return (
    <>
      <Section title={`Supplier applications (${suppliers.length})`}>
        {suppliers.length === 0 ? (
          <p style={{ color: themeVar.textSecondary }}>No applications waiting.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {suppliers.map((s) => (
              <li key={s.id} style={rowStyle}>
                <div>
                  <strong>{s.name}</strong>{' '}
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    {[s.city, s.country].filter(Boolean).join(', ')}
                    {s.website ? ` · ${s.website}` : ''}
                  </span>
                  <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
                    /{s.slug}
                  </div>
                </div>
                <div>
                  <StatusBadge kind="draft" label="Awaiting review" />{' '}
                  <SupplierDecision supplierId={s.id} published={s.isPublished} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Parts awaiting publication (${parts.length})`}>
        {parts.length === 0 ? (
          <p style={{ color: themeVar.textSecondary }}>No parts waiting.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {parts.map((p) => (
              <li key={p.id} style={rowStyle}>
                <div>
                  <strong>{p.name}</strong>{' '}
                  <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                    {p.partNumber}
                    {p.brand ? ` · ${p.brand}` : ''} · {p.supplierName}
                  </span>
                  <div>{money(p.price, p.currency)}</div>
                  {p.supplierPublished === false && (
                    /**
                     * ⚠️ WORTH SAYING OUT LOUD. Publishing a part whose SUPPLIER
                     * is unpublished puts a row in the database that the public
                     * API will not return — the supplier join excludes it. The
                     * part would look published here and be invisible to buyers,
                     * which reads as a marketplace bug. `verify/021` check 7
                     * asserts that orphan is readable at table level precisely
                     * so the join has something real to exclude.
                     */
                    <p style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary, margin: 0 }}>
                      Its supplier is not published yet — publish the listing
                      first, or this part stays invisible to buyers.
                    </p>
                  )}
                </div>
                <div>
                  <StatusBadge kind="draft" label="Draft" />{' '}
                  <PartDecision partId={p.id} published={p.isPublished} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: primitive.space[3],
  flexWrap: 'wrap',
  alignItems: 'center',
  borderTop: `1px solid ${themeVar.borderDefault}`,
  padding: `${primitive.space[3]} 0`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg }}>{title}</h2>
      {children}
    </section>
  );
}
