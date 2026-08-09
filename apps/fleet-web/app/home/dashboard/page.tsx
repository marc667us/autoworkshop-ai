import { needsWorkshop, registrationStatus, renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
import { CreateFleetScreen } from '../../_screens/create-fleet-screen';
import { VerificationStatus } from '../../_screens/verification-status';

/**
 * `/home/dashboard` — fleet-web's canonical landing (§18).
 *
 * 🔴 THE FIRST CONCRETE PAGE IN THIS APP. Until now every route here, including
 * this one, fell through to the catch-all and rendered the honest "not built
 * yet" placeholder — which was correct for a screen with no content, and wrong
 * for the one screen that has to exist before any of the others can matter: the
 * one that lets a `fleet_administrator` come into being.
 *
 * ⚠️ THE GATE, AND WHAT IT ACTUALLY ASKS. `needsWorkshop(status)` is the same
 * predicate supplier-web and workshop-web use, and it is MISNAMED: `hasWorkshop`
 * is computed in `registration.controller.ts` as `active.length > 0` over ALL of
 * the viewer's memberships, regardless of workspace or organisation type. So it
 * asks "does this account belong to any organisation at all", not "…in this
 * workspace".
 *
 * That is the right question here anyway, because the database enforces one
 * organisation per account — a person who owns a workshop genuinely cannot also
 * register a fleet, and `register_fleet` refuses them with a 409. Reusing the
 * shared predicate keeps one definition of "not onboarded yet"; three copies
 * would be three chances for the apps to disagree about who is finished.
 *
 * ⚠️ ITS CONSEQUENCE, STATED RATHER THAN DISCOVERED: a signed-in workshop owner
 * or customer opening fleet-web is NOT shown this registration screen — they
 * fall through to the module page below. They are not fleet staff, so the
 * placeholder with its sibling links is what they get, which is honest. Naming
 * it here because the alternative is somebody later reading the gate as
 * workspace-scoped and building on that.
 *
 * ⚠️ AND THE PLACEHOLDER IS STILL THE RIGHT ANSWER ONCE THEY BELONG. A fleet
 * that exists still has no dashboard content built, so the module page renders
 * and says so with its sibling links intact. That is deliberate: the alternative
 * is a blank screen, and ADR-020's consequence for this build is that an empty
 * fleet screen must SAY it is empty and offer somewhere to go.
 */
export default async function Page() {
  const status = await registrationStatus('fleet');
  if (needsWorkshop(status)) {
    return <CreateFleetScreen displayName={status?.displayName} />;
  }
  return (
    <>
      {/* The wait this app promised at sign-up, shown where they land. */}
      <VerificationStatus />
      {renderModulePage('fleet', ['home', 'dashboard'], await viewerGrants('fleet'))}
    </>
  );
}
