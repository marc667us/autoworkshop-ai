import { requireNavRoute } from '@autoworkshop/next-shell';
import { InspectionReportScreen } from '../../../_screens/inspection-report-screen';

/**
 * `/service-and-repairs/inspection-report?job=<id>` — what the workshop found.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireNavRoute('customer', '/service-and-repairs/inspection-report');
  const params = (await searchParams) ?? {};
  const raw = params['job'];
  return <InspectionReportScreen jobCardId={Array.isArray(raw) ? raw[0] : raw} />;
}
