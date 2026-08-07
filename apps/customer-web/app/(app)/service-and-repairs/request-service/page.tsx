import { RequestServiceScreen } from '../../../_screens/request-service-screen';

/**
 * `/service-and-repairs/request-service?workshop=<id>` — the owner's value
 * chain, step 4-5.
 *
 * ⚠️ NO `requireNavRoute`. This route is reached from a MECHANIC CARD in the
 * public directory, not from the customer's own menu, so it is deliberately not
 * a menu entry — and gating it on the nav tree would 404 the one link the whole
 * funnel depends on. Authorization is where it belongs: `POST /service-requests`
 * requires a session, and RLS pins the author to the caller.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = params['workshop'];
  const workshopId = Array.isArray(raw) ? raw[0] : raw;
  return <RequestServiceScreen workshopId={workshopId} />;
}
