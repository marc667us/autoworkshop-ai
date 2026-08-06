import { requireNavRoute } from '@autoworkshop/next-shell';
import { MyKnowledgeScreen } from '../../../_screens/my-knowledge-screen';

/**
 * /support/knowledge — `01 (1).txt` §33, the customer workspace.
 *
 * Slice 13. The screen is shared with the Help Centre's advice section but the
 * COPY differs, so the wording is passed in rather than branched on the route
 * inside the component — a screen that inspects its own URL to decide what to
 * say is a screen with two behaviours and one test.
 *
 * 🔴 It reads only articles that are BOTH published AND shared. `is_published`
 * alone is the workshop's technician-facing library.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireNavRoute('customer', '/support/knowledge');
  return (
    <MyKnowledgeScreen
      title="Knowledge"
      description="Advice your workshop has written for its customers — servicing, common faults and what to do about them."
      emptyTitle="Nothing published yet"
      emptyBody="Your workshop has not shared any articles. Message them with a question and they can answer directly."
    />
  );
}
