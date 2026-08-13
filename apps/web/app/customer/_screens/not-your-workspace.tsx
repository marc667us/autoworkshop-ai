import Link from 'next/link';
import { PageHeader } from '@autoworkshop/ui';
import { primitive, themeVar } from '@autoworkshop/design-tokens';

/**
 * What a WORKSHOP employee is shown when they open the CUSTOMER app.
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 *
 * Measured 2026-08-04: `owner@autoworkshop.local` opened this app and saw
 * "Your vehicles (3)" — one belonging to Adjoa Boateng and two to Kwame
 * Mensah. The API narrows to a person's OWN vehicles only when
 * `activeRole === 'customer'`; a viewer whose active role is `workshop_owner`
 * gets the organisation's, which is correct for the workshop app and a
 * confidentiality breach on a page headed "Your vehicles".
 *
 * ⚠️ IT NAMES A REACHABLE ALTERNATIVE. This is a refusal, and a refusal with no
 * way forward is a wall — the most expensive defect class in this repository.
 * The person is staff; the workshop app is where their work is, and the
 * marketplace is open to them either way.
 *
 * ⚠️ IT DOES NOT SAY "ACCESS DENIED" AND STOP. Nothing was done wrong: they are
 * signed in, correctly, to an app that is not theirs. The wording says which app
 * they want rather than implying a permissions problem to be escalated.
 */
export function NotYourWorkspace({ name }: { name: string | null }) {
  return (
    <>
      <PageHeader
        title="This is the customer app"
        description={
          name
            ? `${name}, your account belongs to a workshop — not to a vehicle owner.`
            : 'Your account belongs to a workshop — not to a vehicle owner.'
        }
      />

      <div
        style={{
          border: `1px solid ${themeVar.borderDefault}`,
          borderLeft: `4px solid ${themeVar.statusAttention}`,
          borderRadius: primitive.radius.xl,
          background: themeVar.surfaceRaised,
          padding: primitive.space[6],
          display: 'flex',
          flexDirection: 'column',
          gap: primitive.space[3],
          maxWidth: '38rem',
        }}
      >
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          These screens show a vehicle owner their own cars, repairs and
          invoices. Your account has no vehicles of its own here, so there is
          nothing on them for you — and showing you somebody else’s would be
          wrong.
        </p>
        <p style={{ margin: 0, lineHeight: 1.7 }}>
          <strong>Your work is in the workshop app</strong>, where the job cards,
          customers and vehicles you are responsible for actually live.
        </p>
        <p style={{ margin: 0 }}>
          {/*
            The parts marketplace is genuinely open to them — it is public — so
            it is offered rather than dangled. A link that refuses on arrival
            would be the same wall wearing a different sign.
          */}
          <Link href="/marketplace">Browse the parts marketplace</Link>
        </p>
      </div>

      <p
        style={{
          marginTop: primitive.space[4],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          maxWidth: '38rem',
          lineHeight: 1.7,
        }}
      >
        If you also own a vehicle serviced by this workshop, ask them to add you
        as a customer — you will keep this same sign-in and these screens will
        fill with your own cars.
      </p>
    </>
  );
}
