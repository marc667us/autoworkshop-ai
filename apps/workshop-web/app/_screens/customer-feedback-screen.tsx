import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';
import { navLabelFor } from './nav-label';
import { FeedbackReplyForm } from './customer-feedback-reply';

/**
 * WHAT THE CUSTOMER THOUGHT — slice 2,
 * `/customers-and-vehicles/customer-feedback`.
 *
 * ── 🔴 THE CUSTOMER'S WORDS CANNOT BE EDITED, AND THAT IS THE FEATURE ──────
 *
 * `trg_feedback_rewrite` refuses any change to the rating, the comment, the
 * source or who it is about — on UPDATE **and** on DELETE, because "a rule
 * enforced on UPDATE and nowhere else" has been the defect twice in this
 * repository. There is deliberately no route that edits a review: a workshop
 * that can edit a one-star review has a review system that means nothing, and
 * one that can delete it has a marketing page.
 *
 * The only write after the fact is the workshop's REPLY, once, and only by the
 * owner or the manager — replying speaks for the whole business.
 *
 * ── ⚠️ THE SOURCE IS SHOWN ON EVERY ROW ────────────────────────────────────
 *
 * `staff_recorded` is not the same claim as `customer_portal`, and a screen that
 * rendered them identically would let a workshop present its own notes as the
 * customer's voice. The column is not decoration.
 */

interface FeedbackRow {
  id: string;
  jobCardId: string | null;
  customerName: string | null;
  rating: number;
  comment: string | null;
  source: string;
  response: string | null;
  respondedByName: string | null;
  respondedAt: string | null;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  customer_portal: 'Left by the customer',
  staff_recorded: 'Recorded by staff',
  telephone: 'Taken by telephone',
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/** Text as well as colour — `01 (1).txt` §66 forbids colour as the only signal. */
function stars(rating: number): string {
  return `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} ${rating} of 5`;
}

export async function CustomerFeedbackScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Customer Feedback');
  const feedback = await apiGet<FeedbackRow[]>('workshop', '/customer-feedback');

  const header = (
    <PageHeader
      title={title}
      description="What customers said about their repairs. Reviews cannot be edited or removed — the workshop can publish one reply to each."
    />
  );

  if (!feedback.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={feedback.reason} workspaceId="workshop" />
      </>
    );
  }

  if (feedback.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No feedback yet"
          description="Reviews left by customers, and any a member of staff records on their behalf, appear here in the order they arrived."
        />
      </>
    );
  }

  const unanswered = feedback.data.filter((f) => f.response === null).length;
  const average =
    feedback.data.reduce((sum, f) => sum + f.rating, 0) / feedback.data.length;

  return (
    <>
      {header}

      <p style={{ fontSize: '0.875rem', marginTop: 0 }}>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{average.toFixed(1)} of 5</strong>{' '}
        across {feedback.data.length} review{feedback.data.length === 1 ? '' : 's'}
        {unanswered > 0 ? ` · ${unanswered} not yet answered` : ' · all answered'}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {feedback.data.map((f) => (
          <li
            key={f.id}
            style={{
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: '0.5rem',
              padding: '0.875rem',
              display: 'grid',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ fontSize: '0.9375rem' }}>{stars(f.rating)}</strong>
              <span style={{ fontSize: '0.8125rem', opacity: 0.8 }}>
                {f.customerName ?? 'Customer not named'} · {when(f.createdAt)}
              </span>
              <StatusBadge
                kind={f.source === 'customer_portal' ? 'complete' : 'draft'}
                label={SOURCE_LABEL[f.source] ?? f.source}
              />
            </div>

            {f.comment ? (
              <blockquote style={{ margin: 0, fontSize: '0.9375rem' }}>{f.comment}</blockquote>
            ) : (
              <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.7 }}>
                A rating with no comment.
              </p>
            )}

            {f.response ? (
              <div
                style={{
                  borderLeft: `3px solid ${themeVar.borderDefault}`,
                  paddingLeft: '0.75rem',
                  fontSize: '0.875rem',
                }}
              >
                <strong style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8 }}>
                  Workshop reply
                  {f.respondedByName ? ` · ${f.respondedByName}` : ''}
                  {f.respondedAt ? ` · ${when(f.respondedAt)}` : ''}
                </strong>
                {f.response}
              </div>
            ) : (
              <FeedbackReplyForm feedbackId={f.id} revalidate={route} />
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
