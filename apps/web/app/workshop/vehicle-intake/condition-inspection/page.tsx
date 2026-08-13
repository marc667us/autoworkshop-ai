import { requireNavRoute } from '@autoworkshop/next-shell';
import { ConditionInspectionScreen } from '../../_screens/condition-inspection-screen';

/**
 * `/vehicle-intake/condition-inspection` — slice 1 of `COMPLETION_PLAN.md`.
 *
 * Photograph the vehicle as it arrives. The first screen in the product that can
 * put a file into MinIO at all: `StorageService` had a complete SigV4 presigner
 * and an integration spec and was wired into NO module, while
 * `repair.execution_evidence.storage_key` had sat deliberately unused since
 * migration 019 waiting for exactly this.
 *
 * `requireNavRoute` FIRST, before any data access: a concrete page.tsx resolves
 * ahead of the catch-all and so carries no route check unless it makes one
 * (T-0005 finding 4).
 */
export const dynamic = 'force-dynamic';

const ROUTE = '/vehicle-intake/condition-inspection';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireNavRoute('workshop', ROUTE);
  return <ConditionInspectionScreen route={ROUTE} searchParams={await searchParams} />;
}
