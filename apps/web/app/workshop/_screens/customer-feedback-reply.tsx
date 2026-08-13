'use client';

import { useId, useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { respondToFeedbackAction } from './reception-actions';

/**
 * Publish the workshop's reply to one review.
 *
 * ⚠️ A CLIENT COMPONENT ONLY BECAUSE THE OUTCOME IS RENDERED IN PLACE. There is
 * one of these per unanswered review, so a full-page form would mean either a
 * separate screen per review or a form that has to be told which one it is
 * about. This keeps the reply where the review is.
 *
 * ⚠️ IT WARNS THAT THE REPLY IS PERMANENT, BEFORE IT IS SENT. `respondToFeedback`
 * refuses a second attempt (`response IS NULL` in the WHERE clause, and
 * `trg_feedback_rewrite` behind that), so somebody who types the wrong thing has
 * no way back. Telling them afterwards would be too late; a "cannot be edited"
 * message that appears only in the error is not a warning, it is an apology.
 *
 * ⚠️ THE ROLE CHECK IS NOT HERE. `mayRespondToFeedback` is enforced in the
 * service, so a viewer who is shown this box and may not use it gets the API's
 * own sentence — which names who CAN reply. That is deliberate: the alternative
 * is hiding the box, and a reader then cannot tell whether nobody has replied or
 * whether they simply cannot see the control.
 */
export function FeedbackReplyForm({
  feedbackId,
  revalidate,
}: {
  feedbackId: string;
  revalidate: string;
}) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim()) return;
        setBusy(true);
        setError(null);
        const result = await respondToFeedbackAction(feedbackId, value.trim(), revalidate);
        setBusy(false);
        if (!result.ok) setError(result.error);
        else setValue('');
      }}
      style={{ display: 'grid', gap: '0.375rem' }}
    >
      <label htmlFor={inputId} style={{ fontSize: '0.75rem', opacity: 0.85 }}>
        Reply to this review — <strong>published once and cannot be edited</strong>
      </label>
      <textarea
        id={inputId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={4000}
        rows={3}
        disabled={busy}
        style={{
          // Form controls do NOT inherit the page typeface. Omitting this is how
          // a workshop ends up with a reply box in Times beside a sans-serif
          // review — the defect the 2026-08-05 design pass found across the
          // whole product.
          fontFamily: 'inherit',
          fontSize: '0.875rem',
          padding: '0.5rem',
          borderRadius: '0.375rem',
          border: `1px solid ${themeVar.borderDefault}`,
          background: 'transparent',
          color: 'inherit',
          resize: 'vertical',
        }}
      />
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: '0.8125rem', color: themeVar.statusDanger }}>
          {error}
        </p>
      ) : null}
      <div>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          style={{
            fontFamily: 'inherit',
            fontSize: '0.8125rem',
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: `1px solid ${themeVar.borderDefault}`,
            background: 'transparent',
            color: 'inherit',
            cursor: busy || !value.trim() ? 'default' : 'pointer',
            opacity: busy || !value.trim() ? 0.6 : 1,
          }}
        >
          {busy ? 'Publishing…' : 'Publish reply'}
        </button>
      </div>
    </form>
  );
}
