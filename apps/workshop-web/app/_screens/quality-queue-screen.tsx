import { Suspense } from 'react';
import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, EmptyState, ErrorState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { InspectionDecisionForm, StartInspectionButton } from './quality-form';

/**
 * The independent quality inspection — Phase 5 slice 9 (`2.txt` §563).
 *
 * `2.txt` §563: "Following repair, an INDEPENDENT quality-control inspection
 * should verify that the ORIGINAL COMPLAINT HAS BEEN ADDRESSED and that NO NEW
 * DEFECT WAS INTRODUCED."
 *
 * ⚠️ THREE ROUTES, ALL ALREADY IN THE APPROVED NAVIGATION, because the five
 * roles that may inspect resolve to three different trees:
 *
 *   §34 default `/repair-services/quality-control`
 *       — quality_control_inspector, workshop_supervisor, platform_administrator.
 *         `navRoleFor` maps the first two to nav ids that have NO tree of their
 *         own (`workshopRoleGroups` defines only owner/manager/reception/
 *         technician), so they fall back to the default tree. The QC INSPECTOR
 *         landing here is the one that would be easiest to get wrong: the role
 *         whose entire job this screen is does NOT get a bespoke tree.
 *   §46 owner   `/repair-control/quality-control`        — workshop_owner
 *   §47 manager `/repair-control/quality-control-queue`  — workshop_manager
 *
 * Building fewer than three would leave one of those roles on a blank page —
 * the trap Slice 4 wrote down, that Slice C then paid for anyway.
 *
 * ⚠️ THE QUEUE IS DIFFERENT FOR EVERY VIEWER. A card you worked on is one you
 * may never sign off, so each row carries `mayInspect` for THIS person. It is
 * computed with the same `repair.user_worked_on_job_card()` the trigger uses,
 * and it decides what the screen ENABLES — never what the database ACCEPTS.
 */

interface QueueItem {
  testSessionId: string;
  jobCardId: string;
  jobNumber: string;
  complaint: string | null;
  stage: string;
  submittedAt: string | null;
  inspectionId: string | null;
  attemptNo: number | null;
  inspectionIsMine: boolean;
  inspectionInspectorName: string | null;
  failedAttempts: number;
  mayInspect: boolean;
  viewerWorkedOnIt: boolean;
}

interface QueueResponse {
  mayInspectAtAll: boolean;
  items: QueueItem[];
}

export async function QualityQueueScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Quality Control');
  return (
    <>
      <PageHeader
        title={title}
        description="An independent check that the original complaint was fixed and nothing new was broken. You cannot inspect a repair you worked on."
      />
      <Suspense fallback={<LoadingState label="Loading repairs awaiting inspection…" />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const result = await apiGet<QueueResponse>('workshop', '/quality-inspections/queue');

  if (!result.ok) {
    const { title, description } = describeApiFailure(result.reason);
    return <ErrorState title={title} message={description} />;
  }

  const { items, mayInspectAtAll } = result.data;

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing is waiting for inspection"
        description="A repair appears here once its testing has been submitted, and leaves once it has passed."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: primitive.space[4] }}>
      {/* Said once, at the top, for somebody who cannot inspect anything at all
          — rather than repeating a refusal on every card. */}
      {!mayInspectAtAll && (
        <p
          role="status"
          style={{
            margin: 0,
            padding: primitive.space[4],
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.lg,
            background: themeVar.backgroundSecondary,
            color: themeVar.textSecondary,
          }}
        >
          You can see what is waiting, but quality control is carried out by an
          inspector, supervisor, manager or the owner — a technician cannot pass their
          own work.
        </p>
      )}

      {items.map((item) => (
        <QueueCard key={item.testSessionId} item={item} />
      ))}
    </div>
  );
}

function QueueCard({ item }: { item: QueueItem }) {
  const open = item.inspectionId !== null;

  return (
    <article
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderLeft: `4px solid ${
          item.failedAttempts > 0 ? themeVar.statusWarning : themeVar.borderDefault
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
          {item.jobNumber}
        </h3>
        <div style={{ display: 'flex', gap: primitive.space[2], flexWrap: 'wrap' }}>
          {item.failedAttempts > 0 && (
            <StatusBadge
              kind="attention"
              label={`${item.failedAttempts} previous failure${item.failedAttempts === 1 ? '' : 's'}`}
            />
          )}
          <StatusBadge
            kind={open ? 'active' : 'draft'}
            label={
              open
                ? `Inspection open (attempt ${item.attemptNo})${
                    item.inspectionIsMine ? ' — yours' : ''
                  }`
                : 'Awaiting inspection'
            }
          />
        </div>
      </header>

      {/* 🔴 THE COMPLAINT IS THE QUESTION. §563 asks whether the ORIGINAL
          complaint was addressed — an inspector who cannot see what the customer
          reported is being asked to verify something they have not been told. */}
      <div>
        <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          The customer&rsquo;s original complaint
        </div>
        <p style={{ margin: `${primitive.space[1]} 0 0`, color: themeVar.textPrimary }}>
          {item.complaint ?? 'No complaint was recorded on this job card.'}
        </p>
      </div>

      {item.submittedAt && (
        <div style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Testing submitted{' '}
          {new Date(item.submittedAt).toLocaleString('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </div>
      )}

      {/* ⚠️ THE FORM ONLY FOR THE INSPECTOR WHO OPENED IT. `decide()` refuses
          anyone else — the signature is the entire value of an independent
          check — so showing a second inspector this form would offer them a
          submit button that could only ever fail. They are told who holds it
          instead, which is the thing they can act on. */}
      {open && item.mayInspect && item.inspectionIsMine ? (
        <InspectionDecisionForm inspectionId={item.inspectionId!} />
      ) : open && !item.inspectionIsMine ? (
        <p
          style={{
            margin: 0,
            fontSize: primitive.fontSize.sm,
            color: themeVar.textSecondary,
            maxWidth: '32rem',
          }}
        >
          {item.inspectionInspectorName ?? 'Another inspector'} has this inspection open.
          Only the person carrying it out can record its result.
        </p>
      ) : (
        <StartInspectionButton
          testSessionId={item.testSessionId}
          disabled={!item.mayInspect}
          reason={
            item.viewerWorkedOnIt
              ? 'You worked on this repair, so you cannot carry out its quality inspection. ' +
                '§563 requires an independent check — a colleague who did not do the work must take it.'
              : undefined
          }
        />
      )}
    </article>
  );
}
