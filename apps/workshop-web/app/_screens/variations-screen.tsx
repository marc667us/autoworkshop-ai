import { Suspense } from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { DecisionForm, RaiseVariationForm, ReviewControls } from './variation-forms';

/**
 * The repair variation flow — Phase 5 slice 7b (`07.txt` §14, §3766 step 12).
 *
 * 🔴 THE ONE THING THIS SCREEN EXISTS TO MAKE VISIBLE: whether the additional
 * work is AUTHORISED. §3766 step 12 says the technician pauses chargeable
 * additional work until approval is received, and a technician cannot pause on a
 * rule they cannot see the state of. Every card says, in words, whether the work
 * may start.
 *
 * ⚠️ FOUR ROUTES, because the roles involved span four trees:
 *
 *   §34 default   `/solution-and-approval/variations`  — supervisor, platform admin
 *   §46 owner     `/repair-control/variations`
 *   §47 manager   `/repair-control/variations`
 *   §49 technician `/record-work/variation-requests`   — where they are RAISED
 *
 * The owner and manager entries were added with this screen: both roles hold
 * `CAN_RAISE_VARIATION` and `CAN_REVIEW_VARIATION` and neither tree carried a
 * variation entry at all. That gap was found by `audit-nav-coverage.mjs` rather
 * than by tripping over it, which is what the audit was built for.
 *
 * ⚠️ THE CONTROLS ARE PER-VIEWER AND PER-STATUS. `mayReview` comes from the API
 * and is false for the person who RAISED the variation — §3792's independence
 * rule. Offering them a review button would hand them an action migrations
 * 032-034 refuse, which reads as a broken screen rather than as a rule.
 */

export const dynamic = 'force-dynamic';

interface Variation {
  id: string;
  jobCardId: string;
  jobNumber: string;
  variationNo: number;
  status: string;
  originalComplaint: string;
  originalApprovedWork: string;
  newFinding: string;
  additionalWork: string;
  additionalParts: string | null;
  additionalLabourHours: number | null;
  additionalCost: number;
  currency: string;
  chargeable: boolean;
  effectOnCompletion: string | null;
  raisedByName: string | null;
  reviewedByName: string | null;
  decision: string | null;
  decidedByName: string | null;
  decisionChannel: string | null;
  decisionNote: string | null;
  workAuthorized: boolean;
  mayReview: boolean;
  raisedByViewer: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft — needs internal review',
  internally_reviewed: 'Reviewed — not yet sent to the customer',
  sent_to_customer: 'With the customer',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function badgeKind(status: string): 'draft' | 'active' | 'complete' | 'attention' | 'blocked' {
  if (status === 'approved') return 'complete';
  if (status === 'rejected' || status === 'withdrawn') return 'blocked';
  if (status === 'sent_to_customer') return 'attention';
  if (status === 'internally_reviewed') return 'active';
  return 'draft';
}

export async function VariationsScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Variations');
  return (
    <>
      <PageHeader
        title={title}
        description="Additional work found during a repair. Chargeable work waits for the customer's approval — it is not authorised until they say yes."
      />
      <Suspense fallback={<LoadingState label="Loading variations…" />}>
        <Body />
      </Suspense>
    </>
  );
}

interface Execution {
  id: string;
  jobCardId: string;
  jobNumber?: string;
  status: string;
}

async function Body() {
  // Loaded together — neither depends on the other, so serialising them would
  // only make the page slower.
  const [result, execResult] = await Promise.all([
    apiGet<Variation[]>('workshop', '/variations'),
    apiGet<Execution[]>('workshop', '/repair-executions'),
  ]);

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return <ErrorState title={title} message={description} />;
  }

  // ⚠️ ACCEPTS EITHER SHAPE. An endpoint returning a bare array while the reader
  // expects `{items}` made every assertion in a previous slice silently empty —
  // one of them "passed" by finding nothing.
  const data = result.data;
  const items: Variation[] = Array.isArray(data)
    ? data
    : ((data as { items?: Variation[] }).items ?? []);

  // ⚠️ A REPAIR STILL IN PROGRESS IS THE ONLY THING A VARIATION CAN ATTACH TO.
  // §3764 places step 11 between "records unexpected findings" and "completes
  // the authorized repair", and the API refuses a variation against a completed
  // execution — so offering one here would be offering a guaranteed refusal.
  const openExecutions: Execution[] = execResult.ok
    ? (Array.isArray(execResult.data) ? execResult.data : []).filter(
        (e) => e.status !== 'completed',
      )
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[6] }}>
      <RaiseSection executions={openExecutions} reachable={execResult.ok} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[4] }}>
        <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
          Variations
        </h2>
        {items.length === 0 ? (
          <EmptyState
            title="No variations"
            description="A variation is raised when a technician finds work that was not in the approved plan."
          />
        ) : (
          items.map((v) => <VariationCard key={v.id} v={v} />)
        )}
      </section>
    </div>
  );
}

/**
 * §3764 step 11 — raising one.
 *
 * ⚠️ SHOWN EVEN WHEN THERE IS NOTHING TO RAISE AGAINST, with the reason. A
 * technician who finds a worn drop link and sees no way to record it will either
 * do the work unrecorded or stop and ask — and the first is what §3766 step 12
 * exists to prevent. Saying "no repair is in progress" tells them which it is.
 */
function RaiseSection({
  executions,
  reachable,
}: {
  executions: Execution[];
  reachable: boolean;
}) {
  return (
    <section
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[3],
      }}
    >
      <h2 style={{ margin: 0, fontSize: primitive.fontSize.lg, color: themeVar.textPrimary }}>
        Found additional work?
      </h2>
      <p style={{ margin: 0, color: themeVar.textSecondary }}>
        Record it here before you do it. Chargeable work is not authorised until the
        customer approves.
      </p>

      {!reachable ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>
          The repairs in progress could not be loaded, so a variation cannot be raised just
          now. The variations already recorded are listed below.
        </p>
      ) : executions.length === 0 ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>
          No repair is currently in progress for you to raise a variation against. A
          variation belongs to a repair that has started and not yet finished.
        </p>
      ) : (
        <RaiseVariationForm executionId={executions[0]!.id} />
      )}
    </section>
  );
}

function VariationCard({ v }: { v: Variation }) {
  const open = ['draft', 'internally_reviewed', 'sent_to_customer'].includes(v.status);

  return (
    <article
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        // Amber while a chargeable variation is unauthorised — the state that
        // means "do not start".
        borderLeft: `4px solid ${
          v.chargeable && !v.workAuthorized ? themeVar.statusWarning : themeVar.borderDefault
        }`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[4],
        display: 'flex',
        flexDirection: 'column',
        gap: primitive.space[3],
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
          {v.jobNumber} · variation {v.variationNo}
        </h3>
        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          <StatusBadge kind={badgeKind(v.status)} label={STATUS_LABEL[v.status] ?? v.status} />
          <StatusBadge
            kind={v.chargeable ? 'attention' : 'draft'}
            label={
              v.chargeable
                ? `${v.currency} ${v.additionalCost.toFixed(2)}`
                : 'No charge'
            }
          />
        </div>
      </header>

      {/* 🔴 THE AUTHORISATION, STATED IN WORDS. This is the field execution code
          consults, and the sentence a technician needs before picking up a
          spanner. A badge alone would be too easy to misread. */}
      <p
        role="status"
        data-testid="variation-authorisation"
        style={{
          margin: 0,
          padding: primitive.space[3],
          borderRadius: primitive.radius.md,
          border: `1px solid ${themeVar.borderDefault}`,
          background: themeVar.backgroundSecondary,
          color: themeVar.textPrimary,
          fontWeight: 600,
        }}
      >
        {v.workAuthorized
          ? 'AUTHORISED — this additional work may be carried out.'
          : v.chargeable
            ? 'NOT AUTHORISED — do not start this work. It is chargeable and the customer has not approved it.'
            : 'No charge, so no approval is required before the work.'}
      </p>

      <Detail label="The customer's original complaint" value={v.originalComplaint} />
      <Detail label="Originally approved work" value={v.originalApprovedWork} />
      <Detail label="What was found" value={v.newFinding} />
      <Detail label="Additional work required" value={v.additionalWork} />
      {v.additionalParts && <Detail label="Additional parts" value={v.additionalParts} />}
      {v.additionalLabourHours !== null && (
        <Detail label="Additional labour" value={`${v.additionalLabourHours} hours`} />
      )}
      {v.effectOnCompletion && (
        <Detail label="Effect on completion" value={v.effectOnCompletion} />
      )}

      <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
        Raised by {v.raisedByName ?? 'somebody no longer listed'}
        {v.reviewedByName ? ` · reviewed by ${v.reviewedByName}` : ''}
        {v.decidedByName ? ` · answered by ${v.decidedByName}` : ''}
        {v.decisionChannel ? ` (${v.decisionChannel.replace('_', ' ')})` : ''}
      </div>

      {v.decisionNote && <Detail label="What they said" value={v.decisionNote} />}

      {/* The controls for whoever's step it is. */}
      {open && v.mayReview && v.status === 'draft' && <ReviewControls variationId={v.id} />}
      {open && v.mayReview && v.status === 'internally_reviewed' && (
        <ReviewControls variationId={v.id} />
      )}
      {open && v.mayReview && v.status === 'sent_to_customer' && (
        <DecisionForm variationId={v.id} chargeable={v.chargeable} />
      )}

      {/* ⚠️ EXPLAINED, NOT HIDDEN. A technician who raised this needs to know it
          is waiting on somebody else, and WHY they cannot move it themselves —
          otherwise the queue looks broken and they ask for it to be "fixed". */}
      {open && !v.mayReview && (
        <p
          style={{
            margin: 0,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
            maxWidth: '34rem',
          }}
        >
          {v.raisedByViewer
            ? 'You raised this, so somebody else must review it — §3792 requires an independent ' +
              'internal review before the customer is asked.'
            : 'A supervisor, manager or the owner reviews this and records the customer’s answer.'}
        </p>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</div>
      <p style={{ margin: `${primitive.space[1]} 0 0`, color: themeVar.textPrimary }}>{value}</p>
    </div>
  );
}
