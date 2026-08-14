import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

interface LevyLine {
  settlementStatus: string;
  currency: string;
  policies: number;
  total: string;
}

/**
 * What this insurer owes the platform for selling here.
 *
 * ⚠️ IT REPORTS WHAT THE DATABASE ACCRUED AND OFFERS NO WAY TO CHANGE IT. The
 * levy is written by an AFTER INSERT trigger at the moment of sale from the
 * rate in force; an insurer who could edit what it owes would not be paying a
 * levy. Settling one is a platform action and is deliberately not on this
 * screen.
 */
export async function PlatformLeviesScreen() {
  const result = await apiGet<LevyLine[]>('insurance', '/insurance/levies');
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Platform Levies" description="What you owe for selling here." />
        <ApiFailure reason={result.reason} workspaceId="insurance" />
      </>
    );
  }
  const lines = result.data;

  return (
    <>
      <PageHeader
        title="Platform Levies"
        description="A percentage of every policy sold on the platform, accrued automatically at the moment of sale."
      />

      {lines.length === 0 ? (
        <EmptyState
          title="Nothing owed yet"
          description="A levy is accrued when a sale is recorded. Nothing has been sold on this account, so nothing is owed."
        />
      ) : (
        <DataTable<LevyLine>
          caption="Levies by settlement status"
          rowKey={(l) => `${l.settlementStatus}-${l.currency}`}
          columns={[
            { key: 'status', header: 'Status', cell: (l) => l.settlementStatus },
            { key: 'policies', header: 'Policies', numeric: true, cell: (l) => String(l.policies) },
            {
              key: 'total',
              header: 'Total',
              numeric: true,
              cell: (l) => `${l.currency} ${l.total}`,
            },
          ]}
          rows={lines}
        />
      )}

      <p
        style={{
          marginTop: primitive.space[6],
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
          lineHeight: 1.6,
          maxWidth: '44rem',
        }}
      >
        The levy is calculated by the platform when a sale is recorded, using the
        rate in force at that moment. Rates are kept with their dates rather than
        overwritten, so a policy sold months ago can still be explained by the
        rate that applied then.
      </p>
    </>
  );
}
