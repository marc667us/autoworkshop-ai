import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { createInsurerAction } from './create-insurer-actions';

/**
 * "Register your insurance company" — what a signed-up person sees on this pack
 * before they belong anywhere.
 *
 * 🔴 THIS IS THE FIRST THING IN THE INSURANCE PACK THAT IS NOT A PLACEHOLDER,
 * and it is first on purpose. The pack shipped with 0 of 28 screens built and,
 * more to the point, with no way for an `insurance_assessor` to exist at all —
 * so every one of those 28 routes rendered to an account that could never gain
 * the role. Building screens before the door is building rooms onto a house
 * with no entrance.
 *
 * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, for the reason
 * `CreateFleetScreen` gives: a redirect needs a second condition on the
 * onboarding route to send finished users away again, the two conditions are
 * then free to disagree, and the result is a redirect loop on the first screen a
 * new user ever reaches with no way out but clearing cookies.
 *
 * ⚠️ MOUNTED IN THE INSURANCE PACK ONLY. A customer with no organisation is not
 * an incomplete insurer — each pack owns its own onboarding, so nobody is asked
 * to register a business they did not come here to register.
 */
export function CreateInsurerScreen({ displayName }: { displayName?: string }) {
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
        Your account is ready. It is not attached to an insurance company yet,
        which is why there is nothing on your dashboard. Name your company below
        and you will be its assessor — claims, damage assessment and repair
        authorisation all live inside it.
      </p>

      {/* 🔴 THE TENANCY FACT, STATED. Migration 080 gives the company its OWN
          tenant rather than filing it inside a workshop's, because an insurer
          and the workshop whose repairs it assesses are on opposite sides of a
          claim and `COMBINED_PLAN_v2` §4 makes the tenant the legal isolation
          boundary. Worth saying out loud: the person registering needs to know
          their assessments are not visible to the garages they assess. */}
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
        Your company gets its own workspace, separate from every workshop on the
        platform. A platform administrator checks each new organisation — you can
        register now and set up straight away; verification affects what other
        businesses see of you, not your own workspace.
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
        Insurance screens are still being built. Registering creates your company
        and your assessor account now; the claims, assessment and authorisation
        screens arrive with their own release, and each unbuilt screen says so
        rather than failing.
      </p>

      <FormShell
        action={createInsurerAction}
        successPrefix="Your company is"
        successHref={{ href: '/insurance/home/dashboard', label: 'Open your dashboard' }}
      >
        <Field
          label="Company name"
          hint="What your company is called. You can change it later."
          htmlFor="insurerName"
        >
          <TextInput
            id="insurerName"
            name="insurerName"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Star Assurance Ghana"
            autoFocus
          />
        </Field>

        <Field
          label="Head office"
          hint="Optional. Where your assessors are based — leave blank and we will name it for you."
          htmlFor="locationName"
        >
          <TextInput
            id="locationName"
            name="locationName"
            maxLength={120}
            placeholder="e.g. Accra office"
          />
        </Field>

        {/* ⚠️ THE FORM SUPPLIES ITS OWN SUBMIT — `FormShell` renders `children`
            and nothing else. Omitting it produces a form with NO WAY TO SUBMIT,
            which typecheck, lint and `next build` all accept: there is no type
            that says "a form needs a button". Two of this repo's forms shipped
            without one, and the owner found them. */}
        <SubmitButton>Register my company</SubmitButton>
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
        supplier, a fleet or another company with this account, sign in with a
        different one — or ask a platform administrator to add you to an existing
        insurance company.
      </p>
    </main>
  );
}
