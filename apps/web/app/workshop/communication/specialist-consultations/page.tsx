import { requireNavRoute } from '@autoworkshop/next-shell';
import { CallsScreen } from '../../_screens/calls-screen';

/**
 * `/communication/specialist-consultations` - "Specialist Consultations". Slice 11 of `COMPLETION_PLAN.md`.
 *
 * Voice and video happen IN THIS APP: signalling through our own API, media
 * directly between the two browsers. It never touches this platform and is
 * never recorded.
 *
 * ONE screen at four routes - sections 46 and 49 name calls, voice, video and
 * specialist consultations separately and they are the same list filtered.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/communication/specialist-consultations';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <CallsScreen route={ROUTE} kind="specialist_consultation" fallbackTitle="Specialist Consultations" />;
}
