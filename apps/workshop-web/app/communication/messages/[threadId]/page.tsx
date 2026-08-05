import { requireNavRoute } from '@autoworkshop/next-shell';
import { ThreadScreen } from '../../../_screens/thread-screen';

/**
 * One conversation. Slice 7.
 *
 * 🔴 SHIPPED IN THE SAME COMMIT AS THE LINKS THAT REACH IT. Every subject in
 * `messages-screen.tsx` points here; a link whose target does not exist is the
 * dead-end defect this repository has recorded more than any other.
 *
 * ⚠️ THE ROUTE CHECK IS AGAINST THE PARENT, `/communication/messages`. This id
 * segment is not a nav entry and never will be, so checking the literal path
 * would refuse everybody. Membership of the thread itself is enforced in
 * `CommsService`, which is the check that actually matters here.
 */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ threadId: string }> }) {
  await requireNavRoute('workshop', '/communication/messages');
  const { threadId } = await params;
  return <ThreadScreen threadId={threadId} />;
}
