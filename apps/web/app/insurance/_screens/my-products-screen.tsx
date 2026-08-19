import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  Select,
  StatusBadge,
  SubmitButton,
} from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { setEnquiryStatusAction, setProductPublicationAction } from './product-actions';

interface Enquiry {
  id: string;
  productId: string;
  productName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  vehicleRegistration: string | null;
  message: string | null;
  premium: string;
  currency: string;
  status: string;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  coverType: string;
  premium: string;
  currency: string;
  termMonths: number;
  isPublished: boolean;
  isVerified: boolean;
}

/**
 * The insurer's own products — migration 082.
 *
 * 🔴 IT SHOWS VERIFICATION AND LISTING AS TWO SEPARATE FACTS, because they are.
 * A product is registered, then VERIFIED by the platform, then LISTED by the
 * insurer, and 082 refuses the third before the second. Collapsing them into
 * one "status" column would leave an insurer staring at a product they cannot
 * list with nothing on screen explaining why — which is the shape of every
 * dead end this repository has recorded.
 */
export async function MyProductsScreen() {
  const result = await apiGet<Product[]>('insurance', '/insurance/products');
  if (!result.ok) {
    return (
      <>
        <PageHeader title="My Products" description="Insurance products you offer for sale." />
        <ApiFailure reason={result.reason} workspaceId="insurance" />
      </>
    );
  }
  const products = result.data;

  return (
    <>
      <PageHeader
        title="My Products"
        description="Insurance products you offer for sale on the platform."
      />

      {products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Register a product to offer it on the marketplace. The platform verifies every new product before it can be listed."
        />
      ) : (
        <DataTable<Product>
          caption="Your insurance products"
          rowKey={(p) => p.id}
          columns={[
            { key: 'name', header: 'Product', cell: (p) => p.name },
            { key: 'cover', header: 'Cover', cell: (p) => p.coverType.replace(/_/g, ' ') },
            {
              key: 'premium',
              header: 'Premium',
              numeric: true,
              cell: (p) => `${p.currency} ${p.premium}`,
            },
            { key: 'term', header: 'Term', numeric: true, cell: (p) => `${p.termMonths} months` },
            {
              key: 'verified',
              header: 'Verified',
              cell: (p) =>
                p.isVerified ? (
                  <StatusBadge kind="active" label="Verified" />
                ) : (
                  <StatusBadge kind="draft" label="Awaiting the platform" />
                ),
            },
            {
              key: 'listed',
              header: 'Listed',
              cell: (p) =>
                p.isPublished ? (
                  <StatusBadge kind="active" label="On sale" />
                ) : (
                  <StatusBadge kind="draft" label="Not listed" />
                ),
            },
            {
              key: 'action',
              header: '',
              // 🔴 NO CONTROL IN THE ROW, AND A SENTENCE WHERE IT WOULD BE. A
              // disabled button with no explanation is the wall this repository
              // keeps recording; naming who decides is the instruction. The
              // control itself is one form below the table, which is also what
              // lets errors surface properly through `FormShell` rather than
              // being swallowed by a per-row action that returns nothing.
              cell: (p) =>
                p.isVerified
                  ? p.isPublished
                    ? 'on sale'
                    : 'ready to list'
                  : 'a platform administrator verifies it first',
            },
          ]}
          rows={products}
        />
      )}

      {/* ⚠️ ONE FORM, NOT ONE PER ROW. `FormShell` is what surfaces an
          ActionResult — a bare `<form action={...}>` cannot, because React
          requires a void-returning action, so the refusal 082 raises for an
          unverified product would have been swallowed silently. That refusal is
          the most useful sentence on this screen. */}
      {products.some((p) => p.isVerified) && (
        <div style={{ marginTop: primitive.space[6], maxWidth: '32rem' }}>
          <FormShell action={setProductPublicationAction} successPrefix="The listing is">
            <Field label="Product" htmlFor="productId">
              <Select
                id="productId"
                name="productId"
                options={products
                  .filter((p) => p.isVerified)
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name} — ${p.isPublished ? 'on sale' : 'not listed'}`,
                  }))}
              />
            </Field>
            <Field label="Action" htmlFor="isPublished">
              <Select
                id="isPublished"
                name="isPublished"
                options={[
                  { value: 'true', label: 'List for sale' },
                  { value: 'false', label: 'Remove from sale' },
                ]}
              />
            </Field>
            <SubmitButton>Apply</SubmitButton>
          </FormShell>
        </div>
      )}

      <EnquiriesSection />
    </>
  );
}

/**
 * THE ENQUIRY INBOX — slice 17's read half, migration 086.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 WHY IT IS A SECTION ON THIS SCREEN AND NOT A NEW MENU ENTRY.
 *
 * `CLAUDE.md` prohibits *changing approved navigation without review*, and the
 * insurance tree has no `enquiries` entry. The precedent set on 2026-08-17 is
 * the one followed here: towing's org-staff roster was rendered INSIDE its
 * existing `/operations/settings` for exactly this reason rather than given a
 * route of its own. An enquiry is an enquiry ABOUT A PRODUCT, so the insurer's
 * product screen is where it belongs until the owner approves an entry.
 *
 * ▶ RECORDED AS A FOLLOW-UP, NOT AS DONE: enquiries deserve their own menu
 *   entry under `Products and Sales`. That is an owner decision, and adding it
 *   unilaterally is the prohibited change.
 *
 * ⚠️ AND WITHOUT THIS SECTION THE PUBLIC FORM WOULD BE A CONTROL THAT DISCARDS
 * ITS INPUT. The write path was built first, deliberately; a read path is what
 * makes it a feature rather than a table nobody looks at.
 * ══════════════════════════════════════════════════════════════════════════
 */
async function EnquiriesSection() {
  const result = await apiGet<Enquiry[]>('insurance', '/insurance/enquiries');

  return (
    <section style={{ marginTop: primitive.space[12] }} aria-labelledby="enquiries-heading">
      <h2
        id="enquiries-heading"
        style={{
          margin: `0 0 ${primitive.space[2]}`,
          fontSize: '1.125rem',
          color: themeVar.textPrimary,
        }}
      >
        Enquiries
      </h2>
      <p
        style={{
          margin: `0 0 ${primitive.space[5]}`,
          fontSize: '0.875rem',
          color: themeVar.textSecondary,
        }}
      >
        People who asked about your listed cover on the public marketplace. Reply to them
        directly — the platform does not reply on your behalf.
      </p>

      {!result.ok ? (
        <ApiFailure reason={result.reason} workspaceId="insurance" />
      ) : result.data.length === 0 ? (
        <EmptyState
          title="No enquiries yet"
          description="Once a product is verified and listed, shoppers can ask about it from the public marketplace and their enquiries arrive here."
        />
      ) : (
        <>
          <DataTable<Enquiry>
            caption="Enquiries about your insurance products"
            rowKey={(e) => e.id}
            columns={[
              { key: 'product', header: 'Product', cell: (e) => e.productName },
              {
                key: 'from',
                header: 'From',
                cell: (e) => (
                  <>
                    {e.contactName}
                    <br />
                    {/* A mailto, because replying is the ONLY thing an insurer
                        can do with this row and making them copy an address by
                        hand is the difference between a feature and a list. */}
                    <a href={`mailto:${e.contactEmail}`}>{e.contactEmail}</a>
                    {e.contactPhone ? (
                      <>
                        <br />
                        {e.contactPhone}
                      </>
                    ) : null}
                  </>
                ),
              },
              {
                key: 'vehicle',
                header: 'Vehicle',
                // An unstated registration is genuinely absent, not empty.
                cell: (e) => e.vehicleRegistration ?? '—',
              },
              { key: 'message', header: 'Message', cell: (e) => e.message ?? '—' },
              {
                key: 'premium',
                header: 'Quoted',
                numeric: true,
                // 🔴 THE SNAPSHOT, NOT TODAY'S PRICE. 086 copies the premium
                // onto the enquiry precisely so a re-priced product does not
                // rewrite what the shopper was responding to.
                cell: (e) => `${e.currency} ${e.premium}`,
              },
              {
                key: 'status',
                header: 'Status',
                cell: (e) =>
                  // 🔴 THE VOCABULARY IS `StatusKind`'s, NOT AN INVENTED ONE.
                  // `neutral` and `pending` do not exist and the compiler said
                  // so; picking the nearest real kind keeps this badge reading
                  // the same as every other status in the product, which is the
                  // whole point of a shared kind list. A NEW enquiry is the one
                  // that needs acting on, so it takes `attention`.
                  e.status === 'closed' ? (
                    <StatusBadge kind="complete" label="Closed" />
                  ) : e.status === 'contacted' ? (
                    <StatusBadge kind="active" label="Contacted" />
                  ) : (
                    <StatusBadge kind="attention" label="New" />
                  ),
              },
            ]}
            rows={result.data}
          />

          <div style={{ marginTop: primitive.space[6], maxWidth: '32rem' }}>
            <FormShell action={setEnquiryStatusAction} successPrefix="The enquiry is">
              <Field label="Enquiry" htmlFor="enquiryId">
                <Select
                  id="enquiryId"
                  name="enquiryId"
                  options={result.data.map((e) => ({
                    value: e.id,
                    label: `${e.contactName} — ${e.productName} (${e.status})`,
                  }))}
                />
              </Field>
              <Field label="Mark as" htmlFor="status">
                <Select
                  id="status"
                  name="status"
                  options={[
                    { value: 'contacted', label: 'Contacted' },
                    { value: 'closed', label: 'Closed' },
                    { value: 'new', label: 'New' },
                  ]}
                />
              </Field>
              <SubmitButton>Apply</SubmitButton>
            </FormShell>
          </div>
        </>
      )}
    </section>
  );
}
