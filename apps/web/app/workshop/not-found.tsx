import Link from 'next/link';
import { currentViewer } from '@autoworkshop/next-shell';
import { PageHeader } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * The workshop app's 404.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * `requireNavRoute` answers `notFound()` for a route that is not in THIS VIEWER'S
 * navigation tree, and that is correct: `07.txt` pt2 gives each role its own tree, and a
 * 403 would confirm the route exists, handing an unauthorised viewer a map of the
 * platform's screens.
 *
 * But the two commonest reasons a real person lands here are not attacks:
 *
 *   1. They followed a link or a note written for a DIFFERENT ROLE. The technician
 *      reaches repair execution at `/record-work/repair-tasks`; an owner reaches the
 *      same records at `/repair-control/repairs-in-progress`. Neither path works for the
 *      other, by design.
 *   2. They are signed in as somebody else than they think — reception defaults to a
 *      different organisation, for instance.
 *
 * Next's default 404 is a bare page. To somebody who has just been told "go to Record
 * Work → Repair Tasks" it reads as a broken product, and the real answer — "you are
 * signed in as an owner, and that screen lives in the technician's menu" — is
 * information they already hold. Withholding it protects nothing.
 *
 * ⚠️ IT NAMES NO ROUTE THE VIEWER CANNOT ALREADY SEE. The links below are read from
 * THEIR OWN navigation tree, so this page cannot become the map that answering 403 would
 * have handed over. The role is stated because they can read it in the top bar anyway.
 */
export default async function NotFound() {
  const viewer = await currentViewer('workshop');

  return (
    <>
      <PageHeader
        title="That screen is not in your menu"
        description="Either the address is wrong, or it belongs to a different role's menu — every role in a workshop reaches its own set of screens."
      />

      <div
        style={{
          maxWidth: '40rem',
          padding: primitive.space[4],
          border: `1px solid ${themeVar.borderDefault}`,
          borderRadius: primitive.radius.md,
          // Positioned containing block, for the reason every container here has one.
          position: 'relative',
        }}
      >
        {viewer ? (
          <>
            <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textPrimary }}>
              You are signed in as <strong>{viewer.displayName ?? 'this user'}</strong>
              {viewer.activeRole ? (
                <>
                  , acting as <strong>{humanRole(viewer.activeRole)}</strong>
                </>
              ) : null}
              .
            </p>
            <p
              style={{
                margin: `0 0 ${primitive.space[3]} 0`,
                color: themeVar.textSecondary,
                fontSize: primitive.fontSize.sm,
              }}
            >
              {/* The concrete, commonest case, said plainly. */}
              The same work often lives at a different address for a different role — a
              technician records a repair under <em>Record Work</em>, while an owner or
              manager sees the same repairs under <em>Repair Control</em>. Use the menu on
              the left rather than a pasted address, or switch role in the top bar if you
              hold more than one.
            </p>
          </>
        ) : (
          <p style={{ margin: `0 0 ${primitive.space[3]} 0`, color: themeVar.textPrimary }}>
            You may not be signed in. Sign in first — the menu is built from your role.
          </p>
        )}

        <p style={{ margin: 0 }}>
          <Link href="/workshop/home/dashboard" style={{ color: primitive.color.blue[600], fontWeight: 600 }}>
            Go to your dashboard
          </Link>
        </p>
      </div>
    </>
  );
}

/**
 * A role id as a person would say it.
 *
 * Falls back to the raw value rather than inventing a label — the same judgement
 * `affectedSystemLabel` and `resourceKindLabel` make, and for the same reason: an
 * unknown role shown as itself is ugly and truthful.
 */
function humanRole(role: string): string {
  const known: Record<string, string> = {
    platform_administrator: 'a platform administrator',
    workshop_owner: 'the workshop owner',
    workshop_manager: 'a workshop manager',
    workshop_supervisor: 'a workshop supervisor',
    technician: 'a technician',
    reception_staff: 'reception',
    storekeeper: 'a storekeeper',
    cashier: 'a cashier',
    quality_control_inspector: 'a quality-control inspector',
    customer: 'a customer',
  };
  return known[role] ?? role;
}
