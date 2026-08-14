import { Field, FormShell, Select, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { registerProductAction } from './product-actions';

/**
 * Register an insurance product for sale — migration 082.
 *
 * ⚠️ IT SAYS THE PRODUCT WILL NOT BE ON SALE IMMEDIATELY, BEFORE THE FORM
 * RATHER THAN AFTER IT. 082 refuses publication until a platform administrator
 * verifies the product, and a rule a person meets only by being refused reads
 * as a bug — the reasoning `CreateWorkshopScreen` records about the
 * one-workshop rule.
 */
export function RegisterProductScreen() {
  return (
    <main style={{ maxWidth: '38rem', padding: primitive.space[6] }}>
      <h1 style={{ fontSize: primitive.fontSize.xl, marginBottom: primitive.space[2] }}>
        Register a product
      </h1>

      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.6,
          marginBottom: primitive.space[4],
        }}
      >
        Describe the cover you sell. It is saved to your account straight away and
        is <strong>not on sale yet</strong> — a platform administrator verifies
        every new product first, then you list it yourself from My Products.
      </p>

      {/* 🔴 THE LEVY IS STATED BEFORE THE FIRST SALE, NOT DISCOVERED AFTER ONE.
          The platform takes a percentage of every policy sold here. An insurer
          who learns that from a statement rather than from this page has been
          treated badly, and this product exists because the owner asked for a
          levy — so naming it is part of the feature, not a disclaimer. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.6,
          marginBottom: primitive.space[6],
          borderLeft: `3px solid ${themeVar.borderDefault}`,
          paddingLeft: primitive.space[3],
        }}
      >
        Selling on this platform carries a levy — a percentage of each policy,
        accrued automatically when a sale is recorded. The rate and everything
        outstanding are under Platform Levies.
      </p>

      <FormShell
        action={registerProductAction}
        successPrefix="Your product is"
        successHref={{ href: '/insurance/sales/my-products', label: 'See my products' }}
      >
        <Field label="Product name" hint="What a buyer will see." htmlFor="name">
          <TextInput
            id="name"
            name="name"
            required
            minLength={2}
            maxLength={160}
            placeholder="e.g. Comprehensive 12-month"
            autoFocus
          />
        </Field>

        {/* The six values 082's CHECK admits, and no seventh. A control that
            offers what the database refuses is a 400 waiting to happen. */}
        <Field label="Cover type" htmlFor="coverType">
          <Select
            id="coverType"
            name="coverType"
            defaultValue="comprehensive"
            options={[
              { value: 'third_party', label: 'Third party' },
              { value: 'third_party_fire_theft', label: 'Third party, fire and theft' },
              { value: 'comprehensive', label: 'Comprehensive' },
              { value: 'windscreen', label: 'Windscreen' },
              { value: 'roadside_assistance', label: 'Roadside assistance' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </Field>

        <Field label="Premium" hint="The price for the whole term." htmlFor="premium">
          <TextInput id="premium" name="premium" required inputMode="decimal" placeholder="1200" />
        </Field>

        <Field label="Currency" hint="Three letters, for example GHS." htmlFor="currency">
          <TextInput id="currency" name="currency" defaultValue="GHS" maxLength={3} />
        </Field>

        <Field label="Term in months" htmlFor="termMonths">
          <TextInput
            id="termMonths"
            name="termMonths"
            required
            inputMode="numeric"
            defaultValue="12"
          />
        </Field>

        <Field label="Excess" hint="Optional. What the customer pays per claim." htmlFor="excess">
          <TextInput id="excess" name="excess" inputMode="decimal" placeholder="250" />
        </Field>

        <Field
          label="Summary"
          hint="Optional. A line or two a buyer will read."
          htmlFor="summary"
        >
          <TextInput
            id="summary"
            name="summary"
            maxLength={2000}
            placeholder="Full cover including windscreen"
          />
        </Field>

        {/* ⚠️ THE FORM SUPPLIES ITS OWN SUBMIT — `FormShell` renders children and
            nothing else. Two of this repository's forms shipped with no way to
            submit at all, and typecheck, lint and a build accepted every one. */}
        <SubmitButton>Register this product</SubmitButton>
      </FormShell>
    </main>
  );
}
