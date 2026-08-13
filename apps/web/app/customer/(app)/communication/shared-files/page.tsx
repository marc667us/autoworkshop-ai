import { requireNavRoute } from '@autoworkshop/next-shell';
import { SharedFilesScreen } from '../../../_screens/shared-files-screen';

/**
 * `/communication/shared-files` — the customer workspace, `01 (1).txt` §33. Slice 7.
 *
 * Every file shared in a conversation — a view of media.links, never a second store.
 *
 * `requireNavRoute` FIRST: a concrete page.tsx resolves ahead of the catch-all
 * and so carries NO route check unless it makes one (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/communication/shared-files';

export default async function Page() {
  await requireNavRoute('customer', ROUTE);
  return <SharedFilesScreen route={ROUTE} />;
}
