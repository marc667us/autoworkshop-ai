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
import { setProductPublicationAction } from './product-actions';

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
    </>
  );
}
