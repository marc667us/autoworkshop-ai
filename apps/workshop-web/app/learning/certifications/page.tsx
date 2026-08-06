import { requireNavRoute } from '@autoworkshop/next-shell';
import { CertificationsScreen } from '../../_screens/certifications-screen';

/**
 * `/learning/certifications` - "Certifications". Technician tree (section 49).
 *
 * 🔴 A RE-MOUNT, NOT A NEW SCREEN. The same certification register slice 10 mounted at /knowledge-and-staff/certifications.
 *
 * Section 49 gives the technician its own names and its own group for things
 * the workshop trees already have. Building a second implementation per tree is
 * how two screens start disagreeing about the same data; `navLabelFor` reads
 * the heading back from whichever tree the viewer is in, so one screen can
 * carry several names honestly.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries NO route check unless it makes one
 * (T-0005 finding 4). Without it, mounting a screen here would make it
 * reachable by a role whose tree does not contain it.
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/learning/certifications';

export default async function Page() {
  await requireNavRoute('workshop', ROUTE);
  return <CertificationsScreen route={ROUTE} />;
}
