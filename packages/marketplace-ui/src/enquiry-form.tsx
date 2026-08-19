'use client';

import { useRef, useState } from 'react';
import { primitive } from '@autoworkshop/design-tokens';
import { SOLAR } from './solar-theme';

/**
 * THE ENQUIRY FORM — the only write on the public surface.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 THIS EXISTS ONLY BECAUSE MIGRATION 086 GAVE IT SOMEWHERE TO GO.
 *
 * The task list's instruction was explicit: ask the write-path question BEFORE
 * building this. There was no enquiry table, so a form here would have been a
 * control that discards what a person types into it — the same defect class as
 * the five roles that shipped with no production path that wrote them. The
 * order was table → policy → function → endpoint → THIS.
 *
 * ── 🔴 IT TAKES A SERVER ACTION AS A PROP. THE FIRST VERSION CALLED THE API
 *    FROM THE BROWSER AND WAS WRONG TWICE OVER. ───────────────────────────
 *
 * The original comment here argued a server action gained nothing, because the
 * endpoint is anonymous. That reasoning missed the thing that decides it: the
 * BASE URL. `apiBaseUrl()` reads `process.env.API_BASE_URL` — a SERVER-only
 * variable with no `NEXT_PUBLIC_` prefix — so in the browser it is `undefined`
 * and falls back to `http://localhost:4000`. Every enquiry a real visitor sent
 * would have gone to their own machine.
 *
 * It also would not build. `public-api.ts` imports `@autoworkshop/auth`, whose
 * index re-exports modules that use `next/headers`; pulling that into a
 * `'use client'` bundle fails `next build` with *"You're importing a component
 * that needs next/headers"*. This module was the FIRST client component ever to
 * import `public-api.ts` — every previous caller was a server component, which
 * is why the import had always been safe.
 *
 * ⚠️ NEITHER FAULT WAS VISIBLE TO `tsc` OR `eslint`. Both were green over it;
 * only the `Next — production build` CI job caught them. That job exists for
 * exactly this, and this file is now the second entry in that ledger.
 *
 * So the POST runs on the server, where `API_BASE_URL` exists, and is handed in
 * as a prop — the same shape `insurance/layout.tsx` uses for `signOutAction`.
 * The four states below (idle / submitting / sent / failed) stay here, because
 * they are presentation and are what "Required per module" asks for: loading,
 * error, success, and a control that cannot be double-submitted.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** What the server action must accept and return. Structural, so the action can
 *  live in the app (where `API_BASE_URL` is readable) without this package
 *  importing anything server-only. */
export type SubmitEnquiry = (input: {
  productId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  vehicleRegistration?: string;
  message?: string;
}) => Promise<{ ok: true } | { ok: false; reason: string }>;

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'sent' }
  | { kind: 'failed'; reason: string };

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: SOLAR.cardAlt,
  color: SOLAR.text,
  border: `1px solid ${SOLAR.border}`,
  borderRadius: '8px',
  padding: `${primitive.space[2]} ${primitive.space[3]}`,
  fontSize: '0.9375rem',
};

const label: React.CSSProperties = {
  display: 'block',
  marginBottom: primitive.space[1],
  fontSize: '0.8125rem',
  // `SOLAR.sub` (6.19:1), not `muted`. An `opacity` here would silently rescale
  // contrast — recorded on 2026-08-18 after axe flagged exactly that as SERIOUS.
  color: SOLAR.sub,
};

export function EnquiryForm({
  productId,
  insurer,
  action,
}: {
  productId: string;
  insurer: string;
  action: SubmitEnquiry;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  /**
   * 🔴 A REF, NOT THE STATE, IS THE LOCK — and the first version of this file
   * got that wrong while its comment claimed otherwise.
   *
   * `setState` is asynchronous. Two submit events dispatched before React
   * commits the re-render both read `state.kind === 'idle'`, both pass the
   * guard, and both POST. Disabling the button only helps AFTER the commit, so
   * neither the disabled attribute nor a state check closes the window. A ref
   * mutates synchronously, so the second event sees the lock the first set.
   *
   * Every duplicate here is a row in the insurer's inbox that nobody can
   * distinguish from real demand. Caught by Codex, 2026-08-19.
   */
  const inFlight = useRef(false);

  if (state.kind === 'sent') {
    return (
      <div
        role="status"
        style={{
          border: `1px solid ${SOLAR.green}`,
          borderRadius: '8px',
          padding: primitive.space[4],
          background: SOLAR.cardAlt,
        }}
      >
        <strong style={{ display: 'block', color: SOLAR.greenText, marginBottom: primitive.space[1] }}>
          Your enquiry has been sent
        </strong>
        <span style={{ color: SOLAR.sub, fontSize: '0.875rem' }}>
          {insurer} has your details and will reply to the e-mail address you gave.
        </span>
      </div>
    );
  }

  const busy = state.kind === 'submitting';

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        // The synchronous lock — see `inFlight` above for why the disabled
        // attribute and a state check both leave the window open.
        if (inFlight.current) return;
        inFlight.current = true;
        setState({ kind: 'submitting' });
        const data = new FormData(e.currentTarget);
        const read = (k: string) => String(data.get(k) ?? '').trim();
        const result = await action({
          productId,
          contactName: read('contactName'),
          contactEmail: read('contactEmail'),
          // Omitted rather than sent empty: the API treats absent as absent and
          // 086 turns a blank into NULL, so sending '' would rely on two layers
          // agreeing about a value neither wants.
          contactPhone: read('contactPhone') || undefined,
          vehicleRegistration: read('vehicleRegistration') || undefined,
          message: read('message') || undefined,
        });
        // 🔴 RELEASED ONLY ON FAILURE. On success the form is replaced by the
        // confirmation panel and must never accept a second send; clearing the
        // lock unconditionally would re-open the double-submit window for the
        // instant before that render commits.
        if (!result.ok) inFlight.current = false;
        setState(result.ok ? { kind: 'sent' } : { kind: 'failed', reason: result.reason });
      }}
      style={{ display: 'grid', gap: primitive.space[4] }}
    >
      {state.kind === 'failed' ? (
        <div
          role="alert"
          style={{
            border: `1px solid ${SOLAR.orange}`,
            borderRadius: '8px',
            padding: primitive.space[3],
            fontSize: '0.875rem',
          }}
        >
          {/* The API's own wording, which names what the visitor can do next.
              Replacing it with a generic message would throw away the only
              actionable half of the answer. */}
          {state.reason}
        </div>
      ) : null}

      <div>
        <label style={label} htmlFor="enq-name">
          Your name
        </label>
        <input id="enq-name" name="contactName" required maxLength={120} style={field} autoComplete="name" />
      </div>

      <div>
        <label style={label} htmlFor="enq-email">
          E-mail address
        </label>
        <input
          id="enq-email"
          name="contactEmail"
          // `type="email"` gives the browser's own validation and the right
          // keyboard on a phone. The API validates the shape again, and 086's
          // CHECK constraint a third time — none of the three trusts the others.
          type="email"
          required
          maxLength={320}
          style={field}
          autoComplete="email"
        />
      </div>

      <div>
        <label style={label} htmlFor="enq-phone">
          Phone number <span style={{ color: SOLAR.muted }}>(optional)</span>
        </label>
        <input id="enq-phone" name="contactPhone" maxLength={40} style={field} autoComplete="tel" />
      </div>

      <div>
        <label style={label} htmlFor="enq-reg">
          Vehicle registration <span style={{ color: SOLAR.muted }}>(optional)</span>
        </label>
        <input id="enq-reg" name="vehicleRegistration" maxLength={40} style={field} />
      </div>

      <div>
        <label style={label} htmlFor="enq-message">
          Anything the insurer should know <span style={{ color: SOLAR.muted }}>(optional)</span>
        </label>
        <textarea id="enq-message" name="message" rows={4} maxLength={2000} style={{ ...field, resize: 'vertical' }} />
      </div>

      <button
        type="submit"
        disabled={busy}
        style={{
          justifySelf: 'start',
          background: busy ? SOLAR.borderLift : SOLAR.gold,
          color: busy ? SOLAR.sub : '#1a1a2e',
          fontWeight: 700,
          border: 'none',
          borderRadius: '9999px',
          padding: `${primitive.space[3]} ${primitive.space[6]}`,
          cursor: busy ? 'progress' : 'pointer',
          fontSize: '0.9375rem',
        }}
      >
        {busy ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  );
}
