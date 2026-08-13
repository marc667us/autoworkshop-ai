import { Suspense } from 'react';
import {
  requireWorkspaceAccess,
  apiGet,
  describeApiFailure,
} from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive, statusVar } from '@autoworkshop/design-tokens';

/**
 * The Operations Centre.
 *
 * Ported from Solar's `/admin/operations`, which implements Project Execution
 * Directive §17. Every row here is the result of a real protocol exchange made
 * when the page was loaded — not a cached status, not a container health flag.
 *
 * ⚠️ EACH PROBE SAYS WHAT IT PROVED, AND THAT COLUMN IS THE POINT OF THE PAGE.
 * A green light that means "the port accepted a connection" and a green light
 * that means "Keycloak read its database and served this realm" look identical
 * and are worth completely different amounts. Keycloak reported healthy here for
 * thirty hours with a dead database; stating the claim next to the light is how
 * a reader knows which kind they are looking at.
 *
 * ⚠️ THE ROUTE ALREADY EXISTED IN THE APPROVED NAVIGATION —
 * `home/operations-dashboard`, gated on `platform.admin`. No navigation change.
 */

export const dynamic = 'force-dynamic';

type ProbeStatus = 'up' | 'down' | 'degraded' | 'not_configured';

interface Probe {
  id: string;
  name: string;
  status: ProbeStatus;
  latencyMs: number | null;
  detail: string;
  proves: string;
}

interface OperationsReport {
  generatedAt: string;
  probes: Probe[];
  migrations: { applied: number; latest: string | null; detail: string };
  audit: { total: number; last24h: number; detail: string };
  counts: { up: number; down: number; degraded: number; notConfigured: number };
}

export default async function OperationsDashboardPage() {
  await requireWorkspaceAccess('admin', 'platform.admin');

  return (
    <>
      <PageHeader
        title="Operations Dashboard"
        description="Every dependency probed for real when this page loaded — a protocol exchange, not a container health flag."
      />
      <Suspense fallback={<LoadingState label="Probing dependencies…" />}>
        <Report />
      </Suspense>
    </>
  );
}

async function Report() {
  const result = await apiGet<OperationsReport>('admin', '/operations/report');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return <ErrorState title={title} message={description} />;
  }

  const { probes, counts, migrations, audit, generatedAt } = result.data;

  // Worst first: an administrator opening this page is usually looking for the
  // thing that is broken.
  const rank: Record<ProbeStatus, number> = { down: 0, degraded: 1, not_configured: 2, up: 3 };
  const sorted = [...probes].sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[4] }}>
      <section
        aria-label="Dependency summary"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: primitive.space[4],
          alignItems: 'center',
          padding: primitive.space[4],
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.lg,
          background: themeVar.backgroundSecondary,
        }}
      >
        <Tally label="Down" value={counts.down} tone="down" />
        <Tally label="Degraded" value={counts.degraded} tone="degraded" />
        <Tally label="Not configured" value={counts.notConfigured} tone="not_configured" />
        <Tally label="Up" value={counts.up} tone="up" />
        <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Probed{' '}
          {new Date(generatedAt).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'medium',
          })}
        </p>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[3] }}>
        {sorted.map((p) => (
          <ProbeCard key={p.id} probe={p} />
        ))}
      </div>

      <section
        aria-label="Database state"
        style={{
          display: 'grid',
          gap: primitive.space[3],
          gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
        }}
      >
        <Fact
          title="Schema migrations"
          value={String(migrations.applied)}
          detail={`${migrations.detail}${migrations.latest ? ` Latest: ${migrations.latest}.` : ''}`}
        />
        <Fact
          title="Audit events (24h)"
          value={String(audit.last24h)}
          detail={audit.detail}
          // An audit log receiving nothing is the shape of a control that was
          // never wired, so it is called out rather than shown as a plain zero.
          tone={audit.total === 0 ? 'degraded' : 'up'}
        />
      </section>
    </div>
  );
}

function ProbeCard({ probe }: { probe: Probe }) {
  return (
    <article
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderLeft: `4px solid ${toneColour(probe.status)}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
      }}
    >
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: primitive.space[3],
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ margin: 0, fontSize: primitive.fontSize.base, color: themeVar.textPrimary }}>
          {probe.name}
        </h3>
        <div style={{ display: 'flex', gap: primitive.space[3], alignItems: 'baseline' }}>
          {probe.latencyMs !== null && (
            <span
              style={{
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
                fontFamily: primitive.fontFamily.mono,
              }}
            >
              {probe.latencyMs} ms
            </span>
          )}
          {/* Stated in words as well as colour — the status must survive a
              colour-blind reader and a printed report. */}
          <StatusBadge kind={badgeKind(probe.status)} label={label(probe.status)} />
        </div>
      </header>

      <p style={{ margin: `${primitive.space[2]} 0 0`, color: themeVar.textPrimary }}>
        {probe.detail}
      </p>

      <p
        style={{
          margin: `${primitive.space[3]} 0 0`,
          paddingTop: primitive.space[3],
          borderTop: `1px solid ${themeVar.borderDefault}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        <strong style={{ color: themeVar.textPrimary }}>What this proves: </strong>
        {probe.proves}
      </p>
    </article>
  );
}

function Fact({
  title,
  value,
  detail,
  tone = 'up',
}: {
  title: string;
  value: string;
  detail: string;
  tone?: ProbeStatus;
}) {
  return (
    <div
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
      }}
    >
      <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{title}</div>
      <div
        style={{
          fontSize: primitive.fontSize['2xl'],
          fontWeight: 700,
          color: toneColour(tone),
          marginTop: primitive.space[1],
        }}
      >
        {value}
      </div>
      <p
        style={{
          margin: `${primitive.space[2]} 0 0`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        {detail}
      </p>
    </div>
  );
}

function Tally({ label: text, value, tone }: { label: string; value: number; tone: ProbeStatus }) {
  return (
    <div style={{ minWidth: '6rem' }}>
      <div
        style={{
          fontSize: primitive.fontSize.xl,
          fontWeight: 700,
          color: value === 0 && tone !== 'up' ? themeVar.textSecondary : toneColour(tone),
        }}
      >
        {value}
      </div>
      <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{text}</div>
    </div>
  );
}

function label(s: ProbeStatus): string {
  if (s === 'up') return 'Up';
  if (s === 'degraded') return 'Degraded';
  if (s === 'not_configured') return 'Not configured';
  return 'Down';
}

/**
 * `StatusKind` is the product's own vocabulary — draft|active|complete|
 * attention|blocked. There is no `error` or `success` member, and naming one
 * yields `undefined` in a style object, which renders as no colour rather than
 * as a failure.
 */
function badgeKind(s: ProbeStatus): 'complete' | 'attention' | 'blocked' | 'draft' {
  if (s === 'up') return 'complete';
  if (s === 'degraded') return 'attention';
  if (s === 'not_configured') return 'draft';
  return 'blocked';
}

function toneColour(s: ProbeStatus): string {
  if (s === 'up') return statusVar.complete;
  if (s === 'degraded') return statusVar.attention;
  if (s === 'not_configured') return statusVar.draft;
  return statusVar.blocked;
}
