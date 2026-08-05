import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createInvoiceAction } from './finance-actions';
import { InvoiceStatus, money, day, when, type InvoiceRow } from './finance-shared';

/**
 * INVOICES — slice 3 of `COMPLETION_PLAN.md`.
 *
 * ONE screen at THREE routes (§34/§46 `/finance/invoices`, §47
 * `/finance-and-warranty/invoices`, §48 `/collection-and-payment/invoices`).
 * Billing is the same act whatever the tree calls it.
 *
 * ── 🔴 WHAT THIS UNBLOCKS ──────────────────────────────────────────────────
 *
 * Until now a job reached quality control and STOPPED. There was no invoice, so
 * no job could be closed for money and no vehicle released against a payment.
 * The plan calls this the highest business value in it, and that is a
 * description of a workshop that could not get paid through this product.
 *
 * ── ⚠️ THE INVOICE IS BUILT FROM THE APPROVED QUOTATION ────────────────────
 *
 * Its lines are COPIED, not joined: a quotation is what the customer AGREED to,
 * an invoice is what they are ASKED to pay, and the two are allowed to differ.
 * Optional quotation lines are excluded — billing an option the customer could
 * decline is charging for something nobody agreed to.
 */

interface JobCardOption {
  id: string;
  jobNumber: string;
  stage: string;
  registrationNumber: string | null;
  customerName: string | null;
}

/**
 * The stages at which a job is genuinely ready to bill.
 *
 * ⚠️ THE LIST IS A HINT, NOT A GATE. The API bills any job card the caller can
 * see, because a workshop occasionally needs to invoice early (a deposit, a
 * customer collecting a part). What this does is put the finished work FIRST,
 * which is the actual job — a filter that HID the others would be a wall.
 */
const READY_TO_BILL = new Set(['quality_control', 'qc_passed', 'ready_for_collection', 'completed', 'closed']);

export async function InvoicesScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Invoices');

  // Loaded together — neither depends on the other.
  //
  // ⚠️ ONLY THE INVOICE LIST MAY FAIL THE SCREEN. The job-card list feeds the
  // "raise an invoice" form; somebody who can read invoices but not job cards
  // should still see the invoices.
  const [invoices, jobCards] = await Promise.all([
    apiGet<InvoiceRow[]>('workshop', '/invoices'),
    apiGet<JobCardOption[]>('workshop', '/job-cards'),
  ]);

  const header = (
    <PageHeader
      title={title}
      description="What customers have been asked to pay, and what is still outstanding. An invoice is built from the approved quotation; once issued, what it says is owed cannot change."
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

  const billable = jobCards.ok
    ? [...jobCards.data].sort((a, b) => {
        const ar = READY_TO_BILL.has(a.stage) ? 0 : 1;
        const br = READY_TO_BILL.has(b.stage) ? 0 : 1;
        return ar - br;
      })
    : [];

  const outstanding = invoices.data.filter((i) => i.status === 'issued' || i.status === 'part_paid');

  return (
    <>
      {header}

      {invoices.data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Raise one against a job card whose work is finished. The lines come from its approved quotation, and you can add anything else by hand before issuing it."
        />
      ) : (
        <DataTable
          caption="Invoices"
          summary={`${outstanding.length} outstanding · ${invoices.data.length} in total`}
          rowKey={(i) => i.id}
          rows={invoices.data}
          columns={[
            { key: 'number', header: 'Invoice', nowrap: true, cell: (i) => i.invoiceNumber },
            { key: 'job', header: 'Job', nowrap: true, cell: (i) => i.jobNumber ?? '—' },
            { key: 'customer', header: 'Customer', cell: (i) => i.customerName ?? '—' },
            {
              key: 'vehicle', header: 'Vehicle', secondary: true, nowrap: true,
              cell: (i) => i.registrationNumber ?? '—',
            },
            { key: 'total', header: 'Total', numeric: true, nowrap: true,
              cell: (i) => money(i.grossTotal, i.currency) },
            {
              key: 'balance', header: 'Outstanding', numeric: true, nowrap: true,
              // The number the desk actually acts on: gross − credited − paid.
              cell: (i) => (i.status === 'void' ? '—' : money(i.balance, i.currency)),
            },
            { key: 'due', header: 'Due', numeric: true, secondary: true, nowrap: true,
              cell: (i) => day(i.dueAt) },
            { key: 'status', header: 'Status', cell: (i) => <InvoiceStatus status={i.status} /> },
          ]}
        />
      )}

      <h2 style={{ fontSize: '1rem', marginTop: '2rem' }}>Raise an invoice</h2>
      {billable.length === 0 ? (
        <EmptyState
          title="No job cards to bill"
          description="An invoice is raised against a job card. Open one first — booking a vehicle in is what creates it."
        />
      ) : (
        <FormShell
          action={createInvoiceAction}
          successPrefix="Raised invoice"
          successHref={{ href: route, label: 'Back to the invoice list' }}
        >
          <Field
            label="Job card"
            hint="Finished work is listed first. Its approved quotation becomes the invoice lines."
            htmlFor="jobCardId"
          >
            <Select
              id="jobCardId"
              name="jobCardId"
              required
              options={billable.map((j) => ({
                value: j.id,
                label: `${j.jobNumber} — ${j.registrationNumber ?? 'no registration'} — ${j.customerName ?? 'no customer'}${READY_TO_BILL.has(j.stage) ? '' : ' (still in progress)'}`,
              }))}
            />
          </Field>
          <Field label="Due date" hint="Optional. Leave blank for payment on collection." htmlFor="dueAt">
            <TextInput id="dueAt" name="dueAt" type="datetime-local" />
          </Field>
          <Field label="Notes" hint="Anything the customer should read on the invoice." htmlFor="notes">
            <TextInput id="notes" name="notes" maxLength={2000} />
          </Field>
          <SubmitButton>Raise the invoice as a draft</SubmitButton>
        </FormShell>
      )}

      <p style={{ fontSize: '0.8125rem', opacity: 0.8 }}>
        A new invoice is a <strong>draft</strong>: you can still change its lines. Issuing it is
        what makes it the customer&rsquo;s record, and after that it can only be corrected with a
        credit note. Last raised {when(invoices.data[0]?.createdAt ?? null)}.
      </p>
    </>
  );
}
