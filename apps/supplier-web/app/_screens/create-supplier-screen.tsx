import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { createSupplierAction } from './create-supplier-actions';

/**
 * "Register your parts supplier" — what a signed-up person sees on this app
 * before they belong anywhere. Owner request, 2026-08-09.
 *
 * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, for the reason
 * `CreateWorkshopScreen` gives: a redirect needs a second condition on the
 * onboarding route to send finished users away again, the two conditions are
 * then free to disagree, and the result is a redirect loop on the first screen
 * a new user ever reaches with no way out but clearing cookies. Rendering in
 * place has one condition and therefore cannot loop.
 *
 * ⚠️ MOUNTED IN supplier-web ONLY. A customer with no organisation is not an
 * incomplete supplier, and a workshop owner is not one either — each app owns
 * its own onboarding, so nobody is asked to register a business they did not
 * come here to register.
 */
export function CreateSupplierScreen({ displayName }: { displayName?: string }) {
  return (
    <main style={{ maxWidth: '38rem', margin: '0 auto', padding: primitive.space[8] }}>
      <h1
        style={{
          fontSize: primitive.fontSize.xl,
          color: themeVar.textPrimary,
          marginBottom: primitive.space[2],
        }}
      >
        {displayName ? `Welcome, ${displayName}.` : 'Welcome.'}
      </h1>

      {/* Says what happened and what happens next. A new user's most common
          worry here is that sign-up went wrong — their account works perfectly
          and the application looks empty, which is exactly what a failure would
          look like too. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.6,
          marginBottom: primitive.space[4],
        }}
      >
        Your account is ready. It is not attached to a business yet, which is why
        there is nothing on your dashboard. Name your business below and you will
        be its owner — your catalogue, stock, orders and parts requests all live
        inside it.
      </p>

      {/* 🔴 THE VERIFICATION STEP IS STATED BEFORE SIGN-UP, NOT AFTER.
          Migration 069 queues every self-registration for a platform
          administrator, and `catalogue.suppliers.is_published` stays FALSE until
          they approve. A supplier who loads a catalogue and then cannot find
          themselves in the marketplace will read that as a broken product —
          this repository's rule is that a user is never left uncertain whether
          something worked. Naming the wait, and what is possible during it, is
          the difference between a queue and a dead end. */}
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
        A platform administrator checks every new business before it appears in
        the public parts marketplace. You can register now and set everything up
        straight away — your listing goes live once you are verified.
      </p>

      <FormShell
        action={createSupplierAction}
        successPrefix="Your business is"
        successHref={{ href: '/home/dashboard', label: 'Open your dashboard' }}
      >
        <Field
          label="Business name"
          hint="What your customers call you. You can change it later."
          htmlFor="supplierName"
        >
          <TextInput
            id="supplierName"
            name="supplierName"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Abossey Okai Spare Parts Ltd"
            autoFocus
          />
        </Field>

        <Field
          label="First location"
          hint="Optional. Where you hold stock — leave blank and we will call it Main location."
          htmlFor="locationName"
        >
          <TextInput id="locationName" name="locationName" maxLength={120} placeholder="e.g. Accra depot" />
        </Field>

        {/* ⚠️ THE FORM SUPPLIES ITS OWN SUBMIT — `FormShell` renders `children`
            and nothing else. Omitting it produces a form with NO WAY TO SUBMIT,
            which typecheck, lint and `next build` all accept: there is no type
            that says "a form needs a button". Two of this repo's 49 forms
            shipped without one, and the owner found them. */}
        <SubmitButton>Register my business</SubmitButton>
      </FormShell>

      {/* ⚠️ NAMES THE ONE-ORGANISATION RULE BEFORE IT IS HIT, not after. The API
          refuses a second registration with a 409, and a rule a user discovers
          only by being refused reads as a bug. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
          marginTop: primitive.space[6],
        }}
      >
        One account belongs to one business. If you already own a workshop or a
        supplier with this account, sign in with a different one — or ask a
        platform administrator to add you to an existing business.
      </p>
    </main>
  );
}
