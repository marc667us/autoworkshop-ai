import { PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Workshop dashboard — §18, the default landing page for the workspace.
 *
 * The figures below are DEMO DATA and are labelled as such on screen. Phase 5
 * replaces them with real job-card and staging-board queries. Labelling fake
 * numbers is not decoration: an unlabelled demo dashboard is indistinguishable
 * from a real one that is silently returning wrong figures.
 */

const tiles = [
  { label: 'Active job cards', value: 12, kind: 'active' as const, hint: 'On the staging board now' },
  { label: 'Awaiting approval', value: 2, kind: 'attention' as const, hint: 'Customer proposals pending' },
  { label: 'New complaints', value: 4, kind: 'attention' as const, hint: 'Received today' },
  { label: 'Ready for collection', value: 3, kind: 'complete' as const, hint: 'Passed quality control' },
  { label: 'Reorder alerts', value: 2, kind: 'blocked' as const, hint: 'Parts below minimum stock' },
  { label: 'Appointments today', value: 6, kind: 'active' as const, hint: 'Across 4 service bays' },
];

function Tile({ label, value, kind, hint }: (typeof tiles)[number]) {
  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        background: themeVar.surfaceRaised,
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[2],
      }}
    >
      <span style={{ fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{label}</span>
      <span style={{ fontSize: primitive.fontSize['3xl'], fontWeight: 600, color: themeVar.textPrimary }}>{value}</span>
      {/* Colour is never the only signal (§66) — every tile carries a text label too. */}
      <StatusBadge kind={kind} label={hint} />
    </div>
  );
}

export default function Dashboard() {
  return (
    <>
      <PageHeader
        title="Workshop Dashboard"
        description="Today at Demo Motors Ltd — Accra Main"
        actions={<StatusBadge kind="draft" label="Demo data — not yet wired to the API" />}
      />

      <section
        aria-label="Key figures"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(15rem, 1fr))',
          gap: primitive.space[4],
        }}
      >
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </section>

      <section
        aria-label="About this build"
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          padding: primitive.space[4],
          background: themeVar.backgroundSecondary,
        }}
      >
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
          What is real in this build
        </h2>
        <ul style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm, lineHeight: 1.7 }}>
          <li>
            <strong>Navigation is real and complete.</strong> Every group and item is transcribed from
            <code> autoworkshop 01 (1).txt</code> §34 — 11 groups, 55 items. Expand, collapse, search the menu,
            and collapse the whole sidebar from the ☰ button.
          </li>
          <li>
            <strong>Permission-aware visibility is real.</strong> Finance items and the Settings group only appear
            because the demo viewer holds <code>finance.read</code> and <code>organization.admin</code>.
          </li>
          <li>
            <strong>Counters and warning badges are real mechanics, fake numbers.</strong> They resolve through the
            same code path the API will use.
          </li>
          <li>
            <strong>Page content is not built yet.</strong> Every other route renders an honest “not built” page
            rather than a convincing mock — Phases 4–7 fill them in.
          </li>
        </ul>
      </section>
    </>
  );
}
