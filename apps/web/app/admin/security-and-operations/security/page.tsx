import { Suspense } from 'react';
import {
  requireWorkspaceAccess,
  apiGet,
  describeApiFailure,
} from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive, statusVar } from '@autoworkshop/design-tokens';

/**
 * The Security Hub — the posture of the live database, measured not asserted.
 *
 * Modelled on Solar's SOC-2 readiness audit, whose one idea worth copying is
 * that it reports what it MEASURES against the running system rather than what
 * the migrations claim. Every finding on this page came out of `pg_catalog` at
 * the moment the page was loaded.
 *
 * ⚠️ THE ROUTE ALREADY EXISTED IN THE APPROVED NAVIGATION. `packages/navigation`
 * has carried `security-and-operations/security` under `platform.admin` since
 * the trees were built, so this page needed no navigation change — which
 * `05.txt` §2 prohibits without review. It replaces the catch-all placeholder
 * that was resolving here.
 *
 * ⚠️ THIS PAGE'S GATE IS NOT THE SECURITY CONTROL, but the reason differs from
 * every other screen in this application and is worth stating. Elsewhere a page
 * gate only decides what the UI admits exists, and a viewer who slips past it
 * still meets `TenantGuard` and then RLS, which return nothing. Here the API
 * reads `pg_catalog`, which has no policies and no tenant column — so
 * `SecurityController`'s administrator check is the ONLY enforcement, and there
 * is no third layer beneath it. What would leak is a list of which tables are
 * unprotected, which is an attacker's shopping list.
 */

export const dynamic = 'force-dynamic';

type ControlStatus = 'pass' | 'warn' | 'fail';

interface PostureControl {
  id: string;
  title: string;
  status: ControlStatus;
  summary: string;
  findings: string[];
  rationale: string;
}

interface SecurityPosture {
  generatedAt: string;
  schemas: string[];
  controls: PostureControl[];
  counts: { pass: number; warn: number; fail: number };
}

export default async function SecurityPage() {
  // FIRST STATEMENT, BEFORE ANY DATA ACCESS. `check-page-gates.sh` fails the
  // build if this line is missing or placed after a fetch.
  await requireWorkspaceAccess('admin', 'platform.admin');

  return (
    <>
      <PageHeader
        title="Security"
        description="Isolation, relationship integrity and audit controls, measured against the live database each time this page is opened."
      />
      <Suspense fallback={<LoadingState label="Auditing the database…" />}>
        <PostureReport />
      </Suspense>
    </>
  );
}

async function PostureReport() {
  const result = await apiGet<SecurityPosture>('admin', '/security/posture');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return <ErrorState title={title} message={description} />;
  }

  const { controls, counts, generatedAt, schemas } = result.data;

  if (controls.length === 0) {
    // Not a state the API can currently produce — rendered anyway, because a
    // report page that renders nothing at all is indistinguishable from a
    // report page that is broken.
    return (
      <EmptyState
        title="No controls were evaluated"
        description="The posture audit returned no controls. This is itself a fault — the report should never be empty."
      />
    );
  }

  // Worst first. An administrator opening this page should not have to scroll
  // past eight passes to find the one failure.
  const order: Record<ControlStatus, number> = { fail: 0, warn: 1, pass: 2 };
  const sorted = [...controls].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[4] }}>
      <Summary counts={counts} generatedAt={generatedAt} schemas={schemas} />
      {sorted.map((c) => (
        <ControlCard key={c.id} control={c} />
      ))}
    </div>
  );
}

function Summary({
  counts,
  generatedAt,
  schemas,
}: {
  counts: SecurityPosture['counts'];
  generatedAt: string;
  schemas: string[];
}) {
  return (
    <section
      aria-label="Posture summary"
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
      <Tally label="Failing" value={counts.fail} tone="fail" />
      <Tally label="Needs a decision" value={counts.warn} tone="warn" />
      <Tally label="Passing" value={counts.pass} tone="pass" />
      <p style={{ margin: 0, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Measured {new Date(generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        {' · '}
        {/* Naming the scope matters: Keycloak owns ~90 tables in `public` with
            no RLS, correctly, and a reader who does not know they are excluded
            will assume the report missed them. */}
        schemas {schemas.join(', ')} (Keycloak&rsquo;s own tables are excluded)
      </p>
    </section>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone: ControlStatus }) {
  return (
    <div style={{ minWidth: '6rem' }}>
      <div
        style={{
          fontSize: primitive.fontSize.xl,
          fontWeight: 700,
          color: value === 0 && tone !== 'pass' ? themeVar.textSecondary : toneColour(tone),
        }}
      >
        {value}
      </div>
      <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</div>
    </div>
  );
}

function ControlCard({ control }: { control: PostureControl }) {
  return (
    <article
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        // A coloured left edge carries the status at a glance — but it is never
        // the ONLY carrier: the badge states it in words, because colour alone
        // fails for a colour-blind reader and in a printed report.
        borderLeft: `4px solid ${toneColour(control.status)}`,
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
          {control.title}
        </h3>
        {/* `StatusKind` is draft|active|complete|attention|blocked — the
            product's own vocabulary, not a generic severity scale. A control
            that passed is `complete`, one needing a decision is `attention`,
            and a failing one is `blocked`. The label states it in words as
            well, so the meaning does not depend on colour. */}
        <StatusBadge
          kind={
            control.status === 'pass'
              ? 'complete'
              : control.status === 'warn'
                ? 'attention'
                : 'blocked'
          }
          label={
            control.status === 'pass' ? 'Pass' : control.status === 'warn' ? 'Needs a decision' : 'Fail'
          }
        />
      </header>

      <p style={{ margin: `${primitive.space[2]} 0 0`, color: themeVar.textPrimary }}>
        {control.summary}
      </p>

      {control.findings.length > 0 && (
        <ul
          style={{
            margin: `${primitive.space[3]} 0 0`,
            paddingLeft: primitive.space[6],
            color: themeVar.textSecondary,
            fontSize: primitive.fontSize.sm,
            // Table and column names are long; they scroll inside the card
            // rather than pushing the document sideways.
            overflowX: 'auto',
          }}
        >
          {control.findings.map((f) => (
            <li key={f} style={{ marginBottom: primitive.space[1] }}>
              <code style={{ fontFamily: primitive.fontFamily.mono }}>{f}</code>
            </li>
          ))}
        </ul>
      )}

      {/* Why the control exists, in terms of a defect that really happened.
          Without it a reader has no way to judge whether a warning is worth
          acting on, and an unexplained warning is one that gets ignored. */}
      <p
        style={{
          margin: `${primitive.space[3]} 0 0`,
          paddingTop: primitive.space[3],
          borderTop: `1px solid ${themeVar.borderDefault}`,
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
        }}
      >
        <strong style={{ color: themeVar.textPrimary }}>Why this is checked: </strong>
        {control.rationale}
      </p>
    </article>
  );
}

/**
 * The colour for a status, taken from `statusVar` so the badge and the card
 * edge cannot drift apart — and so both follow the active theme rather than a
 * build-time palette.
 *
 * ⚠️ There is no `statusError` in this design system; the failure colour is
 * `blocked`. Naming a token that does not exist is a runtime `undefined` in a
 * style object, which renders as no colour at all rather than as an error — a
 * failing control would have quietly lost the one visual marker that says so.
 */
function toneColour(status: ControlStatus): string {
  if (status === 'pass') return statusVar.complete;
  if (status === 'warn') return statusVar.attention;
  return statusVar.blocked;
}
