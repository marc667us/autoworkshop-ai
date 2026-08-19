import { Suspense } from 'react';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, LoadingState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';
import { VerifyDecision, WithdrawDecision } from './insurance-review-controls';

/**
 * Insurance product verification — slice 18, the governance half of the
 * insurance marketplace.
 *
 * ⚠️ THIS SCREEN IS THE ONLY WAY AN INSURANCE PRODUCT REACHES THE MARKET.
 * `082_insurance_marketplace.sql:166` installs a database trigger that refuses
 * to publish an unverified product, so an insurer can create and attempt to
 * list and still sell nothing. Before this existed, verification happened by
 * calling the API by hand — which the 2026-08-14 UAT did. That is an operating
 * procedure, not a product, and it is why slice 18 ships before slice 17: a
 * shopper screen built first would have rendered exactly one product, the UAT
 * row, for ever.
 *
 * ⚠️ AN EMPTY QUEUE IS AMBIGUOUS AND SAYS SO. Nothing awaiting review looks
 * identical to a request that returned nothing because the viewer's grant was
 * revoked, or because a JOIN silently dropped every row — an empty list behind
 * a 200 is the exact failure 08-14 spent most of a day on. So the empty state
 * states what it means rather than "All done".
 */

export const dynamic = 'force-dynamic';

interface QueueProduct {
  id: string;
  name: string;
  summary: string | null;
  coverType: string;
  premium: string;
  currency: string;
  termMonths: number;
  excess: string | null;
  termsUrl: string | null;
  isPublished: boolean;
  isVerified: boolean;
  createdAt: string;
  insurerName: string;
}

/**
 * `premium` and `excess` arrive as STRINGS, not numbers, and that is
 * deliberate upstream: `toProduct` does `String(r.premium)` because these are
 * Postgres `numeric`, and routing money through a JavaScript number is how
 * rounding errors enter a financial record. So format the string; never
 * `Number()` it.
 */
/**
 * An insurer-supplied URL, rendered only if it is http/https. See the call site
 * for why the scheme check is load-bearing rather than tidiness.
 */
function httpsOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return /^https?:$/.test(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

function money(amount: string | null, currency: string): string {
  if (amount === null) return '—';
  return `${currency} ${amount}`;
}

export function InsuranceReviewScreen() {
  return (
    <>
      <PageHeader
        title="Insurance product verification"
        description="A product cannot be listed until the platform verifies it — the database refuses publication otherwise. Withdrawing verification also unlists the product."
      />
      <Suspense fallback={<LoadingState label="Loading insurance products…" />}>
        <Queue />
      </Suspense>
    </>
  );
}

async function Queue() {
  const queue = await apiGet<{
    pending: QueueProduct[];
    verified: QueueProduct[];
    truncated: boolean;
  }>('admin', '/admin/insurance/review-queue');
  if (!queue.ok) return <ApiFailure reason={queue.reason} workspaceId="admin" />;

  const { pending, verified, truncated } = queue.data;

  if (pending.length === 0 && verified.length === 0) {
    return (
      /**
       * 🔴 THIS COPY USED TO CLAIM "an empty result here means there are no
       * products at all". That contradicted this file's own header four
       * paragraphs up, and Codex caught it. It is not knowable from here: both
       * `insurance.products` and `identity.organizations` enforce RLS, and a
       * join returns FEWER ROWS rather than failing — so a revoked grant and an
       * empty database produce the identical response. The screen must not
       * assert the one it prefers.
       */
      <EmptyState
        title="Nothing to review"
        description="No insurance products came back. That normally means no insurer has registered one yet — but this list is platform-wide and depends on your administrator grant being live, so an empty result cannot by itself prove the database is empty. If you expect products here, have the grant checked before assuming they were deleted."
      />
    );
  }

  return (
    <>
      {truncated ? (
        /**
         * 🔴 THE CAP IS STATED, NOT HIDDEN. The query returns at most 400
         * products. Without this banner an administrator looking for an older
         * verified product to WITHDRAW would simply not find it, and nothing
         * would say why — the list would look complete. Codex raised the dead
         * end; search and pagination are the real fix and are not built, so the
         * boundary is admitted here instead of being papered over.
         */
        <p
          role="status"
          style={{
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.md,
            padding: primitive.space[3],
            marginBottom: primitive.space[4],
            color: themeVar.textSecondary,
          }}
        >
          Showing the first 400 products only. Older ones are not listed here
          yet — if you need to withdraw one that is missing, it exists but this
          screen cannot reach it.
        </p>
      ) : null}
      <Section title={`Awaiting verification (${pending.length})`}>
        {pending.length === 0 ? (
          <p style={{ color: themeVar.textSecondary, margin: 0 }}>
            Nothing is waiting for a decision.
          </p>
        ) : (
          <ul style={listStyle}>
            {pending.map((p) => (
              <li key={p.id} style={rowStyle}>
                <Details product={p} />
                <div style={actionStyle}>
                  <StatusBadge kind="draft" label="Unverified" />{' '}
                  <VerifyDecision productId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Verified (${verified.length})`}>
        {verified.length === 0 ? (
          <p style={{ color: themeVar.textSecondary, margin: 0 }}>
            Nothing has been verified yet.
          </p>
        ) : (
          <ul style={listStyle}>
            {verified.map((p) => (
              <li key={p.id} style={rowStyle}>
                <Details product={p} />
                <div style={actionStyle}>
                  {/* `StatusBadge` takes active | draft | complete | attention
                      | blocked — there is no "success". `attention` rather than
                      `draft` for a verified-but-unlisted product: it is not a
                      draft, it is approved and sitting idle, which is a thing
                      worth following up with the insurer. */}
                  <StatusBadge
                    kind={p.isPublished ? 'active' : 'attention'}
                    label={p.isPublished ? 'Listed for sale' : 'Verified, not listed'}
                  />{' '}
                  <WithdrawDecision productId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/**
 * The insurer's name is FIRST and unmissable. "Comprehensive 12-month" tells an
 * administrator nothing about whose product it is, and approving the wrong
 * company's product is the mistake this screen exists to prevent — which is why
 * the service joins the organisation in at all.
 */
function Details({ product: p }: { product: QueueProduct }) {
  return (
    <div>
      <strong>{p.insurerName}</strong>
      <span style={{ color: themeVar.textSecondary }}> — {p.name}</span>
      <div style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>
        {p.coverType} · {money(p.premium, p.currency)} · {p.termMonths} month
        {p.termMonths === 1 ? '' : 's'}
        {p.excess !== null ? ` · excess ${money(p.excess, p.currency)}` : ''}
      </div>
      {p.summary ? <p style={{ margin: `${primitive.space[1]} 0 0` }}>{p.summary}</p> : null}
      {httpsOnly(p.termsUrl) ? (
        // The terms are the thing being verified, so they must be reachable
        // from the decision rather than looked up elsewhere. External and
        // untrusted: `noopener` so the opened page cannot reach back through
        // `window.opener`, `noreferrer` so it is not told where it came from.
        //
        // 🔴 AND THE SCHEME IS CHECKED. `z.string().url()` accepts
        // `javascript:` and `data:text/html` — measured 2026-08-19 — because
        // zod delegates to `new URL()`, which parses both. React renders a
        // `javascript:` href in production with only a development warning, so
        // this link was one click from executing an insurer-supplied script IN
        // THE PLATFORM ADMINISTRATOR'S SESSION, which is the highest-privilege
        // session there is. Found while adding the anonymous public page that
        // renders the same field.
        <p style={{ margin: `${primitive.space[1]} 0 0`, fontSize: primitive.fontSize.sm }}>
          <a href={httpsOnly(p.termsUrl) as string} target="_blank" rel="noopener noreferrer">
            Read the policy terms before deciding
          </a>
        </p>
      ) : (
        <p
          style={{
            margin: `${primitive.space[1]} 0 0`,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
          }}
        >
          No terms document supplied — consider that before verifying.
        </p>
      )}
    </div>
  );
}

const listStyle: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: primitive.space[3],
  flexWrap: 'wrap',
  alignItems: 'center',
  borderTop: `1px solid ${themeVar.borderDefault}`,
  padding: `${primitive.space[3]} 0`,
};

const actionStyle: React.CSSProperties = { whiteSpace: 'nowrap' };

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
