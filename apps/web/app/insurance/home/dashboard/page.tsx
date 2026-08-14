import { needsWorkshop, registrationStatus, renderModulePage, viewerGrants } from '@autoworkshop/next-shell';
import { CreateInsurerScreen } from '../../_screens/create-insurer-screen';

/**
 * `/insurance/home/dashboard` — the insurance pack's canonical landing (§18).
 *
 * 🔴 THE FIRST CONCRETE PAGE IN THIS PACK. Until now every route here, including
 * this one, fell through to the catch-all and rendered the honest "not built
 * yet" placeholder — correct for a screen with no content, and wrong for the one
 * screen that has to exist before any of the others can matter: the one that
 * lets an `insurance_assessor` come into being.
 *
 * ⚠️ THE GATE, AND WHAT IT ACTUALLY ASKS. `needsWorkshop(status)` is the same
 * predicate the other packs use, and it is MISNAMED: `hasWorkshop` is computed
 * in `registration.controller.ts` as `active.length > 0` over ALL of the
 * viewer's memberships, regardless of workspace or organisation type. So it asks
 * "does this account belong to any organisation at all", not "…in this
 * workspace".
 *
 * That is the right question here anyway, because the database enforces one
 * organisation per account — a person who owns a workshop genuinely cannot also
 * register an insurance company, and `register_insurer` refuses them with a 409.
 * Reusing the shared predicate keeps ONE definition of "not onboarded yet";
 * copies are chances for the packs to disagree about who is finished.
 *
 * ⚠️ ITS CONSEQUENCE, STATED RATHER THAN DISCOVERED: a signed-in workshop owner
 * or customer opening this pack is NOT shown the registration screen — they fall
 * through to the module page below, and `renderModulePage`'s own
 * `isForeignToWorkspace` check 404s them. They are not insurance staff, which is
 * honest. Named here because the alternative is somebody later reading the gate
 * as workspace-scoped and building on that.
 */
export default async function Page() {
  const status = await registrationStatus('insurance');
  if (needsWorkshop(status)) {
    return <CreateInsurerScreen displayName={status?.displayName} />;
  }
  // Once they belong, the placeholder is still the right answer: the dashboard's
  // own content is not built, and ADR-020's consequence for this build is that an
  // empty screen must SAY it is empty and offer somewhere to go, rather than
  // render blank.
  return renderModulePage('insurance', ['home', 'dashboard'], await viewerGrants('insurance'));
}
