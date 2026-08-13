import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { createFleetAction } from './create-fleet-actions';

/**
 * "Register your fleet" — what a signed-up person sees on this app before they
 * belong anywhere.
 *
 * 🔴 THIS IS THE FIRST THING IN fleet-web THAT IS NOT A PLACEHOLDER, and it is
 * first on purpose. The app shipped with 0 of 29 screens built and, more to the
 * point, with no way for a `fleet_administrator` to exist at all — so every one
 * of those 29 routes rendered to an account that could never gain the role.
 * Building screens before the door would have been building rooms onto a house
 * with no entrance.
 *
 * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, for the reason
 * `CreateSupplierScreen` gives: a redirect needs a second condition on the
 * onboarding route to send finished users away again, the two conditions are
 * then free to disagree, and the result is a redirect loop on the first screen a
 * new user ever reaches with no way out but clearing cookies. Rendering in place
 * has one condition and therefore cannot loop.
 *
 * ⚠️ MOUNTED IN fleet-web ONLY. A customer with no organisation is not an
 * incomplete fleet operator — each app owns its own onboarding, so nobody is
 * asked to register a business they did not come here to register.
 */
export function CreateFleetScreen({ displayName }: { displayName?: string }) {
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
        Your account is ready. It is not attached to a fleet yet, which is why
        there is nothing on your dashboard. Name your fleet below and you will be
        its administrator — your vehicles, drivers, maintenance plans and
        approvals all live inside it.
      </p>

      {/* 🔴 THE VERIFICATION STEP IS STATED BEFORE SIGN-UP, NOT AFTER. Migration
          075 widened the verification queue to accept a fleet, so every
          self-registration waits for a platform administrator exactly as a
          supplier's does. A user who registers and then cannot find the parts of
          the product they expected will read that as broken — naming the wait is
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
        A platform administrator checks every new organisation. You can register
        now and set your fleet up straight away — verification affects what other
        businesses can see of you, not your own workspace.
      </p>

      {/* ⚠️ AND SAY WHAT IS NOT BUILT, BECAUSE THE NEXT SCREEN THEY OPEN IS A
          PLACEHOLDER. Registering works and then most of this workspace says
          "not built yet". A person who was not told will read a working queue as
          a broken product; this repository's rule is that a user is never left
          uncertain whether something worked. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
          lineHeight: 1.6,
          marginBottom: primitive.space[6],
        }}
      >
        Fleet screens are still being built. Registering creates your fleet and
        your administrator account now; the vehicle, driver and maintenance
        screens arrive with their own release, and each unbuilt screen says so
        rather than failing.
      </p>

      <FormShell
        action={createFleetAction}
        successPrefix="Your fleet is"
        successHref={{ href: '/home/dashboard', label: 'Open your dashboard' }}
      >
        <Field
          label="Fleet name"
          hint="What your organisation is called. You can change it later."
          htmlFor="fleetName"
        >
          <TextInput
            id="fleetName"
            name="fleetName"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Accra Logistics Fleet Ltd"
            autoFocus
          />
        </Field>

        <Field
          label="First location"
          hint="Optional. Where your vehicles are based — leave blank and we will name it for you."
          htmlFor="locationName"
        >
          <TextInput
            id="locationName"
            name="locationName"
            maxLength={120}
            placeholder="e.g. Tema depot"
          />
        </Field>

        {/* ⚠️ THE FORM SUPPLIES ITS OWN SUBMIT — `FormShell` renders `children`
            and nothing else. Omitting it produces a form with NO WAY TO SUBMIT,
            which typecheck, lint and `next build` all accept: there is no type
            that says "a form needs a button". Two of this repo's 49 forms
            shipped without one, and the owner found them. */}
        <SubmitButton>Register my fleet</SubmitButton>
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
        One account belongs to one organisation. If you already own a workshop, a
        supplier or another fleet with this account, sign in with a different one
        — or ask a platform administrator to add you to an existing fleet.
      </p>
    </main>
  );
}
