'use client';

import { useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { setServiceCategoryActiveAction } from './settings-actions';

/**
 * Retire or reinstate a service category.
 *
 * 🔴 "RETIRE", NOT "DELETE", AND THE WORD IS LOAD-BEARING. A category that
 * priced past jobs must stay readable or those jobs stop explaining themselves.
 * The migration withholds DELETE from the application role, so this control
 * COULD NOT delete even if it were labelled that way — the label and the
 * mechanism agree, which is the point.
 *
 * The refusal path shows the API's own sentence: `SettingsService` refuses a
 * viewer who may not administer settings and names what they can still do, and
 * replacing that with a generic "not allowed" would throw away the only part
 * they can act on.
 */
export function ToggleServiceCategory({
  id,
  isActive,
  name,
}: {
  id: string;
  isActive: boolean;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const data = new FormData();
    data.set('id', id);
    data.set('isActive', isActive ? 'false' : 'true');
    const result = await setServiceCategoryActiveAction(data);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        style={{
          fontFamily: 'inherit',
          fontSize: '0.8125rem',
          padding: '0.375rem 0.625rem',
          borderRadius: '0.375rem',
          border: `1px solid ${themeVar.borderDefault}`,
          background: 'transparent',
          color: 'inherit',
          cursor: busy ? 'progress' : 'pointer',
          // ⚠️ POSITIONED ANCESTOR, DELIBERATELY. `visuallyHidden` is
          // `position: absolute`, and without a positioned parent it resolves
          // against `<html>` and stretches the document — the recorded cause of
          // T-0044-shaped sideways scroll.
          position: 'relative',
        }}
      >
        {/* The name is in the accessible label, not only in the row: a screen
            reader announcing seven identical "Retire" buttons cannot tell them
            apart. §66 — text, never position alone, carries the meaning.
            `visuallyHidden`, NOT className="sr-only" — that class is undefined
            in this product, so the text would simply render. */}
        {busy ? 'Saving…' : isActive ? 'Retire' : 'Reinstate'}
        <span style={visuallyHidden}>{` ${name}`}</span>
      </button>
      {error ? (
        <p role="alert" style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: themeVar.textPrimary }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
