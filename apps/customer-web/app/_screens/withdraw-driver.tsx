'use client';

import { useState } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { visuallyHidden } from '@autoworkshop/ui';
import { withdrawDriverAction } from './selfservice-actions';

/**
 * Withdraw somebody's authorisation.
 *
 * 🔴 "WITHDRAW", NOT "DELETE", AND THE WORD IS LOAD-BEARING. A collection that
 * happened under this authorisation must remain explicable, so migration 047
 * withholds DELETE from the application role — this control COULD NOT delete
 * even if it were labelled that way. The label and the mechanism agree.
 */
export function WithdrawDriver({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await withdrawDriverAction(id);
          setBusy(false);
          if (!result.ok) setError(result.error ?? 'The authorisation was not withdrawn.');
        }}
        style={{
          fontFamily: 'inherit',
          fontSize: '0.8125rem',
          padding: '0.375rem 0.625rem',
          borderRadius: '0.375rem',
          border: `1px solid ${themeVar.borderDefault}`,
          background: 'transparent',
          color: 'inherit',
          cursor: busy ? 'progress' : 'pointer',
          // ⚠️ POSITIONED ANCESTOR: `visuallyHidden` is `position: absolute`, and
          // without one it resolves against `<html>` and stretches the document.
          position: 'relative',
        }}
      >
        {busy ? 'Withdrawing…' : 'Withdraw'}
        {/* `visuallyHidden`, NOT className="sr-only" — that class is undefined in
            this product, so the text would simply render. A row of identical
            "Withdraw" buttons is unusable with a screen reader without this. */}
        <span style={visuallyHidden}>{` authorisation for ${name}`}</span>
      </button>
      {error ? (
        <p role="alert" style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
