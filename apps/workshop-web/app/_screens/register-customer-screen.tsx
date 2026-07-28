import {
  PageHeader,
  Field,
  FormShell,
  Select,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { registerCustomerAction } from './register-actions';


/**
 * Register a customer — the first screen in this product that WRITES.
 *
 * `POST /api/v1/customers` existed, role-gated, validated and audited, and
 * nothing called it. That is the same "endpoints with no front end" gap the
 * owner objected to, one level down: an endpoint nobody can reach is not a
 * feature, it is a plan.
 *
 * The write goes through a SERVER ACTION (`register-actions.ts`), not a
 * browser fetch. The access token lives in an httpOnly cookie read on the
 * server; a client-side POST would need that credential in JavaScript. The form
 * posts to the server, the server calls the API, and the token never leaves it.
 *
 * NOT A SECURITY CONTROL. `CustomerService` enforces who may create — a
 * technician is refused there whatever this screen offers (CLAUDE.md §8).
 */
export async function RegisterCustomerScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Register Customer');

  return (
    <>
      <PageHeader
        title={title}
        description="Add someone to this workshop's customer book. Only a name is required — the rest can follow."
      />
      <FormShell
        action={registerCustomerAction}
        successPrefix="Registered"
        successHref={{ href: '/customers/customer-search', label: 'View the customer list' }}
      >
        <Field
          label="Full name"
          hint="How reception will find them later. Required."
          htmlFor="displayName"
        >
          <TextInput id="displayName" name="displayName" required autoComplete="off" />
        </Field>

        <Field label="Customer type" htmlFor="customerType">
          <Select
            id="customerType"
            name="customerType"
            defaultValue="individual"
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'business', label: 'Business — a company or fleet' },
            ]}
          />
        </Field>

        <Field label="Telephone" hint="The number the workshop will actually ring." htmlFor="phone">
          {/* `type="tel"` rather than text: it raises the numeric keypad on a
              tablet, which is what reception works from at the counter. */}
          <TextInput id="phone" name="phone" type="tel" autoComplete="off" />
        </Field>

        <Field label="Email" htmlFor="email">
          <TextInput id="email" name="email" type="email" autoComplete="off" />
        </Field>

        <Field
          label="Preferred contact"
          hint="How this customer prefers to be reached."
          htmlFor="preferredContact"
        >
          <Select
            id="preferredContact"
            name="preferredContact"
            defaultValue="phone"
            options={[
              { value: 'phone', label: 'Telephone call' },
              { value: 'sms', label: 'SMS' },
              { value: 'email', label: 'Email' },
              { value: 'in_app', label: 'In the app' },
            ]}
          />
        </Field>

        <Field label="Location" hint="Town or area." htmlFor="location">
          <TextInput id="location" name="location" autoComplete="off" />
        </Field>

        <SubmitButton>Register customer</SubmitButton>
      </FormShell>
    </>
  );
}
