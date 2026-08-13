/**
 * The eight workshop roles of `07.txt` pt2 §50, as the API's GRANTABLE_ROLES
 * lists them.
 *
 * ⚠️ ITS OWN MODULE, WITH NO IMPORTS, AND THAT IS LOAD-BEARING. This list lived
 * in `staff-form.tsx` first, and `staff-roles.spec.ts` importing it dragged in
 * the server action, `@autoworkshop/next-shell`, next-auth and finally
 * `next/server` — which vitest cannot resolve. The suite then reported
 * `0 test` and FAILED TO COLLECT, which is the shape that ran zero tests here
 * for two days while exiting 0.
 *
 * Same convention as `diagnosis-labels.ts` and `job-queue-definitions.ts`:
 * facts a test needs live where a test can reach them.
 *
 * SPELLED EXACTLY AS THE API EXPECTS. `MembershipService` refuses anything
 * outside its allow-list with a deliberately vague "unknown role" — it will
 * not enumerate the taxonomy — so a plausible-but-wrong value produces a
 * refusal that names nothing and is very hard to diagnose from the screen.
 * `staff-roles.spec.ts` reads the API's own set and fails the build on drift.
 */
export const WORKSHOP_ROLES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  { value: 'technician', label: 'Technician', hint: 'Works on the jobs assigned to them' },
  { value: 'workshop_supervisor', label: 'Supervisor', hint: 'Oversees the floor and the board' },
  { value: 'reception_staff', label: 'Reception', hint: 'Takes in vehicles and books customers' },
  { value: 'quality_control_inspector', label: 'Quality control', hint: 'Passes or returns finished work' },
  { value: 'storekeeper', label: 'Storekeeper', hint: 'Parts, stock and goods received' },
  { value: 'cashier', label: 'Cashier', hint: 'Invoices and payments' },
  { value: 'workshop_manager', label: 'Manager', hint: 'Runs the workshop day to day' },
  { value: 'workshop_owner', label: 'Owner', hint: 'Full control, including adding staff' },
];

