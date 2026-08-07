import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { respondToRequestAction } from './supplier-inbox-actions';

/**
 * The SUPPLIER's inbox — the other half of the workshop→supplier edge.
 *
 * Owner, 2026-08-07: the product's job is *"connecting vehicle owners with need
 * to repair with workshops and vehicle part suppliers"*. A workshop can now ask
 * a supplier for a part; without this screen that ask would arrive somewhere
 * nobody looks, which is the same "complete service, no reachable caller"
 * failure this repository has shipped before — twice.
 *
 * ⚠️ THE ROWS ARE NARROWED BY RLS, NOT BY THIS SCREEN. `GET
 * /supplier-requests/inbox` carries no organisation filter, deliberately: a
 * supplier is not an organisation in this schema, and the SELECT policy narrows
 * every row to the suppliers this user actually works for via
 * `catalogue.supplier_users`. Adding a filter here would return nothing for ever.
 */
export const dynamic = 'force-dynamic';

interface PartsRequest {
  id: string;
  supplierName: string;
  partDescription: string;
  quantity: number;
  neededBy: string | null;
  notes: string | null;
  status: string;
  quoteMinor: number | null;
  quoteCurrency: string | null;
  declineReason: string | null;
  createdAt: string;
}

const BADGE: Record<string, 'draft' | 'active' | 'complete' | 'attention' | 'blocked'> = {
  new: 'attention',
  quoted: 'active',
  accepted: 'complete',
  declined: 'blocked',
  cancelled: 'draft',
};

/** Minor units back to something a person reads. Kept next to the form that
 *  converts the other way, so the pair cannot drift apart. */
function money(minor: number | null, currency: string | null): string {
  if (minor === null) return '';
  return `${currency ?? ''} ${(minor / 100).toFixed(2)}`.trim();
}

const CONTROL: React.CSSProperties = {
  height: '2.25rem',
  padding: `0 ${primitive.space[2]}`,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.backgroundPrimary,
  color: themeVar.textPrimary,
};

export function PartsRequestsScreen() {
  return (
    <>
      <PageHeader
        title="Parts Requests"
        description="Workshops asking you for parts. Quote, or say why you cannot supply."
      />
      <Suspense fallback={<LoadingState label="Loading requests…" />}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const result = await apiGet<PartsRequest[]>('supplier', '/supplier-requests/inbox');

  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="supplier" />;

  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No requests yet"
        description="When a workshop finds you in the parts marketplace and asks for a part, their request appears here."
      />
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: primitive.space[4] }}>
      {result.data.map((r) => (
        <li
          key={r.id}
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            padding: primitive.space[4],
            background: themeVar.surfaceRaised,
          }}
        >
          <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: themeVar.textPrimary }}>
              {r.quantity} × {r.partDescription}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <StatusBadge kind={BADGE[r.status] ?? 'draft'} label={r.status} />
            </span>
          </div>

          <p style={{ margin: `${primitive.space[1]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {r.neededBy ? `Needed by ${r.neededBy}` : 'No date given'}
            {r.quoteMinor !== null ? ` · quoted ${money(r.quoteMinor, r.quoteCurrency)}` : ''}
          </p>

          {/* The workshop's note in full — it is usually where the fitment
              detail lives, and a quote given without reading it is a quote for
              the wrong part. */}
          {r.notes ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textPrimary, whiteSpace: 'pre-wrap' }}>
              {r.notes}
            </p>
          ) : null}

          {r.declineReason ? (
            <p style={{ margin: `${primitive.space[2]} 0 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
              Declined: {r.declineReason}
            </p>
          ) : null}

          {/*
            Answerable only while unanswered. The API refuses a second answer
            independently (`AND status = 'new'`), so this is the honest UI for a
            rule enforced elsewhere rather than the rule itself — a supplier must
            not be able to re-price a quote the workshop has already accepted,
            because that is a renegotiation and must not look like an edit.
          */}
          {r.status === 'new' ? (
            <div style={{ display: 'grid', gap: primitive.space[2], marginTop: primitive.space[3] }}>
              <form action={respondToRequestAction} style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="intent" value="quote" />
                {/* 🔴 MAJOR UNITS HERE, minor units on the wire. The action
                    multiplies by 100 — typing 450.00 and sending 450 would
                    under-charge by a hundredfold on every quote. */}
                <label htmlFor={`amt-${r.id}`} style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
                  Price
                </label>
                <input id={`amt-${r.id}`} name="quoteAmount" type="number" step="0.01" min="0" required
                       placeholder="450.00" style={{ ...CONTROL, width: '8rem' }} />
                <input name="quoteCurrency" defaultValue="GHS" maxLength={3} aria-label="Currency"
                       style={{ ...CONTROL, width: '5rem' }} />
                <input name="quoteLeadDays" type="number" min="0" placeholder="Lead days" aria-label="Lead days"
                       style={{ ...CONTROL, width: '7rem' }} />
                <button type="submit" style={{ ...CONTROL, cursor: 'pointer' }}>Send quote</button>
              </form>

              <form action={respondToRequestAction} style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="intent" value="decline" />
                {/* A reason is required in three places: here, the service, and
                    `ck_supplier_request_declined`. "Declined" alone is what the
                    workshop receives, and it is not an answer. */}
                <input name="declineReason" required maxLength={1000} placeholder="Why you cannot supply this"
                       style={{ ...CONTROL, flex: '1 1 16rem' }} />
                <button type="submit" style={{ ...CONTROL, cursor: 'pointer' }}>Decline</button>
              </form>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
