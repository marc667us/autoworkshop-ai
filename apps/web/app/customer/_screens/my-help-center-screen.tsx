import Link from 'next/link';
import { ApiFailure, apiGet, currentViewer } from '@autoworkshop/next-shell';
import { DataTable, PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * HELP CENTRE — slice 13.
 *
 * ── 🔴 A HELP CENTRE THAT IS NOT A PILE OF INVENTED FAQs ───────────────────
 *
 * The tempting build is a dozen hardcoded question-and-answer pairs. Every one
 * would be a claim about how THIS workshop operates, written by a developer who
 * has never met them — "we accept card payments", "collection is before 5pm" —
 * and it would be wrong for most workshops on the platform.
 *
 * So this page carries only things that are TRUE BECAUSE THE DATABASE SAYS SO:
 * the workshop's own published opening hours, and the routes that genuinely
 * exist for getting help. The workshop's own advice lives on Knowledge, which
 * they write themselves.
 *
 * ── 🔴 THE OPENING HOURS COME FROM THE PUBLIC PROFILE, NOT FROM `/settings` ──
 *
 * This screen used to call `GET /settings/opening-hours` and filter the reply
 * for `isPublished` in the browser. The comment here claimed that endpoint
 * "returns only `is_published` rows and is deliberately readable without a
 * workshop role". BOTH HALVES WERE FALSE:
 *
 *   · `SettingsService.listOpeningHours` has no `is_published` predicate. It
 *     returned EVERY row, drafts included, and this page merely declined to
 *     render them — they were in the payload, in the network tab, and in any
 *     script that asked. A page that receives what it must not show has no gate
 *     at all; that is this repository's own rule about the public VIN endpoint.
 *   · being readable without a workshop role was not a decision, it was a
 *     missing assertion. Every sibling read in that service called
 *     `assertMayReadConfig`; these two called nothing, and migration 061 turned
 *     "a colleague can see this" into "any enrolled stranger can see this".
 *     That read is now gated, and a customer is refused.
 *
 * So this asks the endpoint built for exactly this question:
 * `GET /public/workshops/:organizationId/profile`, whose reply is decided by
 * the `public_read` policies in migration 045 — `is_published` is enforced in
 * POSTGRES, not filtered here. A draft rota can no longer reach this page even
 * if a future edit forgets to filter.
 */

/** `PublicCatalogueService.workshopProfile` — field names taken, never guessed. */
interface OpeningHourRow {
  weekday: number;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

interface WorkshopProfile {
  openingHours: OpeningHourRow[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Where a customer can actually get help. Every one of these routes is built. */
const ROUTES = [
  {
    title: 'Something is wrong with my vehicle',
    detail: 'Report it and the workshop will come back to you with a time.',
    href: '/service-and-repairs/report-a-problem',
  },
  {
    title: 'My vehicle cannot be driven',
    detail: 'Request recovery. The workshop sees it immediately.',
    href: '/support/towing',
  },
  {
    title: 'I want to ask the workshop something',
    detail: 'Message them directly, or start a voice or video call.',
    href: '/communication/messages',
  },
  {
    title: 'Something has gone wrong with my service',
    detail: 'Raise a case — billing, a delay, quality, or anything else.',
    href: '/support/support-cases',
  },
  {
    title: 'A repair has failed again',
    detail: 'Claim on the warranty covering it and track the response.',
    href: '/parts-and-warranty/warranty-claims',
  },
  {
    title: 'What do I owe?',
    detail: 'Your invoices, what has been paid, and what is outstanding.',
    href: '/payments/invoices',
  },
];

export async function MyHelpCenterScreen() {
  // The workshop is the customer's ACTIVE organisation, resolved server-side
  // from the validated session — never a value the page could be asked for.
  const viewer = await currentViewer('customer');
  const profile = viewer
    ? await apiGet<WorkshopProfile>('customer', `/public/workshops/${viewer.organizationId}/profile`)
    : ({ ok: false, reason: 'unauthenticated' } as const);
  // Kept as a flat list so the rendering below reads the same as before.
  const hours = profile.ok
    ? ({ ok: true, data: profile.data.openingHours } as const)
    : profile;

  return (
    <>
      <PageHeader
        title="Help Centre"
        description="How to reach your workshop, and what to do about the thing that brought you here."
      />

      <div style={{ display: 'grid', gap: '0.75rem', margin: '1rem 0 2rem' }}>
        {ROUTES.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            style={{
              display: 'block',
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              padding: '0.85rem 1rem',
              textDecoration: 'none',
            }}
          >
            <strong style={{ display: 'block' }}>{r.title}</strong>
            <span style={{ color: themeVar.textSecondary, fontSize: '0.9rem' }}>{r.detail}</span>
          </Link>
        ))}
      </div>

      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>When the workshop is open</h2>
      {!hours.ok ? (
        <ApiFailure reason={hours.reason} workspaceId="customer" />
      ) : hours.data.length === 0 ? (
        // 🔴 SAID PLAINLY. "No hours published" is a fact about this workshop;
        // inventing 9-to-5 would be a claim about a business we know nothing
        // about, and a customer would drive there on it.
        <p style={{ color: themeVar.textSecondary, maxWidth: '60ch' }}>
          This workshop has not published its opening hours. Message them to ask, or ring the
          number on your invoice.
        </p>
      ) : (
        <DataTable
          caption="Published opening hours"
          // Every row that arrives IS published — `public_read` decided that.
          rows={[...hours.data].sort((a, b) => a.weekday - b.weekday)}
          rowKey={(r) => String(r.weekday)}
          columns={[
            { key: 'day', header: 'Day', nowrap: true, cell: (r) => DAYS[r.weekday] ?? '—' },
            {
              key: 'hours',
              header: 'Hours',
              nowrap: true,
              cell: (r) =>
                r.isClosed || !r.opensAt || !r.closesAt
                  ? 'Closed'
                  : `${r.opensAt.slice(0, 5)} – ${r.closesAt.slice(0, 5)}`,
            },
          ]}
        />
      )}
    </>
  );
}
