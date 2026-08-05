import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { EmptyState, PageHeader } from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { PaymentDesk } from './payment-desk';
import { InvoiceStatus, NoCardPaymentNotice, money, day, type InvoiceRow } from './finance-shared';

/**
 * RECEIVE PAYMENT — the collection desk. Slice 3.
 *
 * ONE screen at THREE routes (§48 `/collection-and-payment/receive-payment`,
 * §34/§46 `/finance/payments`, §47 `/finance-and-warranty/payments`).
 *
 * ⚠️ IT LISTS ONLY WHAT IS STILL OWED. A desk taking money does not want a
 * complete billing history; it wants the invoices somebody might walk up and
 * pay. Settled and voided invoices live on the Invoices screen, which is the
 * one that answers "what happened".
 *
 * ⚠️ AND IT SAYS THE PRODUCT DOES NOT CHARGE ANYBODY. See
 * `NoCardPaymentNotice` — ADR-012 forbids a paid processor, so a payment here
 * is a record of money that already arrived.
 */
export async function ReceivePaymentScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Receive Payment');
  const invoices = await apiGet<InvoiceRow[]>('workshop', '/invoices?unpaidOnly=true');

  const header = (
    <PageHeader
      title={title}
      description="Invoices with money still outstanding. Recording a payment issues the customer's receipt in the same step."
    />
  );

  if (!invoices.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={invoices.reason} workspaceId="workshop" />
      </>
    );
  }

  if (invoices.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Nothing is outstanding"
          description="Every issued invoice has been settled. Raise an invoice against a finished job card and it will appear here."
        />
      </>
    );
  }

  const totalOwed = invoices.data.reduce((sum, i) => sum + Number(i.balance), 0);
  const currency = invoices.data[0]!.currency;

  return (
    <>
      {header}
      <NoCardPaymentNotice />

      <p style={{ fontSize: '0.9375rem' }}>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {money(totalOwed.toFixed(2), currency)}
        </strong>{' '}
        outstanding across {invoices.data.length} invoice{invoices.data.length === 1 ? '' : 's'}.
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
        {invoices.data.map((invoice) => (
          <li key={invoice.id}>
            <PaymentDesk
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              currency={invoice.currency}
              balance={invoice.balance}
              revalidate={route}
              summary={
                <>
                  <strong>{invoice.invoiceNumber}</strong>
                  {' · '}
                  {invoice.customerName ?? 'no customer'}
                  {invoice.registrationNumber ? ` · ${invoice.registrationNumber}` : ''}
                  {' · '}
                  <InvoiceStatus status={invoice.status} />
                  <br />
                  <span style={{ fontSize: '0.8125rem', opacity: 0.85 }}>
                    {money(invoice.grossTotal, invoice.currency)} invoiced
                    {Number(invoice.paidTotal) > 0
                      ? ` · ${money(invoice.paidTotal, invoice.currency)} already paid`
                      : ''}
                    {Number(invoice.creditedTotal) > 0
                      ? ` · ${money(invoice.creditedTotal, invoice.currency)} credited`
                      : ''}
                    {invoice.dueAt ? ` · due ${day(invoice.dueAt)}` : ''}
                  </span>
                </>
              }
            />
          </li>
        ))}
      </ul>
    </>
  );
}
