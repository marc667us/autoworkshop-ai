import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

interface Policy {
  id: string;
  policyNumber: string;
  productName: string;
  premium: string;
  currency: string;
  status: string;
  coverStartsOn: string;
  coverEndsOn: string;
  vehicleRegistration: string | null;
  levyAmount: string | null;
  levyPercent: string | null;
  levySettlement: string | null;
}

/**
 * Policies this insurer has sold, and what each one owes the platform.
 *
 * 🔴 THE LEVY IS ON THE SAME ROW AS THE SALE. On its own screen an insurer
 * could read their sales all day without meeting the number they owe. And the
 * API's `listPolicies` LEFT JOINs the levy precisely so a policy whose levy row
 * is somehow missing shows up here as a BLANK — loudly — rather than vanishing
 * from the register, which an INNER JOIN would have done.
 */
export async function PoliciesSoldScreen() {
  const result = await apiGet<Policy[]>('insurance', '/insurance/policies');
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Policies Sold" description="Every policy you have sold here." />
        <ApiFailure reason={result.reason} workspaceId="insurance" />
      </>
    );
  }
  const policies = result.data;

  return (
    <>
      <PageHeader
        title="Policies Sold"
        description="Every policy sold on the platform, and the levy each one accrued."
      />
      {policies.length === 0 ? (
        <EmptyState
          title="No policies sold yet"
          description="Once a product is verified and listed, sales recorded against it appear here with the levy each one accrued."
        />
      ) : (
        <DataTable<Policy>
          caption="Policies sold"
          rowKey={(p) => p.id}
          columns={[
            { key: 'number', header: 'Policy', cell: (p) => p.policyNumber },
            { key: 'product', header: 'Product', cell: (p) => p.productName },
            { key: 'vehicle', header: 'Vehicle', cell: (p) => p.vehicleRegistration ?? '—' },
            {
              key: 'premium',
              header: 'Premium',
              numeric: true,
              cell: (p) => `${p.currency} ${p.premium}`,
            },
            {
              key: 'levy',
              header: 'Platform levy',
              numeric: true,
              // A blank here is a REAL SIGNAL, not a formatting gap: it means the
              // trigger did not write a levy row for this sale, which is the one
              // case worth seeing immediately.
              cell: (p) =>
                p.levyAmount === null
                  ? 'no levy recorded'
                  : `${p.currency} ${p.levyAmount} (${p.levyPercent}%)`,
            },
            {
              key: 'settlement',
              header: 'Levy status',
              cell: (p) =>
                p.levySettlement === 'settled' ? (
                  <StatusBadge kind="complete" label="Settled" />
                ) : (
                  <StatusBadge kind="draft" label={p.levySettlement ?? 'unknown'} />
                ),
            },
            {
              key: 'cover',
              header: 'Cover',
              cell: (p) => `${p.coverStartsOn} to ${p.coverEndsOn}`,
            },
          ]}
          rows={policies}
        />
      )}
    </>
  );
}
