import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { createTowingAction } from './create-towing-actions';

/**
 * "Register your towing company" — what a signed-up person sees on this pack
 * before they belong anywhere.
 *
 * 🔴 THE SHARPEST INSTANCE OF THE ROLE QUESTION IN THIS REPOSITORY. Unlike the
 * insurance pack, towing is NOT unbuilt: migration 074 built it end to end on
 * 2026-08-09 and all ten of its screens work. And `towing_operator` still had
 * no production writer, so those ten working screens belonged to a role nobody
 * could hold. Ten finished rooms and no entrance — every gate green.
 *
 * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, for the reason
 * `CreateFleetScreen` gives: a redirect needs a second condition on the
 * onboarding route to send finished users away again, the two conditions are
 * then free to disagree, and the result is a redirect loop on the first screen a
 * new user ever reaches with no way out but clearing cookies.
 *
 * ⚠️ MOUNTED IN THE TOWING PACK ONLY. A customer with no organisation is not
 * an incomplete towing operator — each pack owns its own onboarding, so nobody is asked
 * to register a business they did not come here to register.
 */
export function CreateTowingScreen({ displayName }: { displayName?: string }) {
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
        Your account is ready. It is not attached to a towing company yet,
        which is why there is nothing on your dashboard. Name your company below
        and you will be its operator — your dispatch board, recovery vehicles,
        drivers and completed recoveries all live inside it.
      </p>

      {/* 🔴 THE TENANCY FACT, STATED. Migration 080 gives the company its OWN
          tenant rather than filing it inside a workshop's, because a towing
          firm is an independent business that recovers vehicles for many
          workshops and for drivers directly, and `COMBINED_PLAN_v2` §4 makes
          the tenant the legal isolation boundary. Worth saying out loud: the
          person registering needs to know their jobs and their drivers are not
          visible to the garages they deliver to. */}
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

      {/* ⚠️ THE OPPOSITE NOTE TO EVERY OTHER REGISTRATION SCREEN, AND IT IS THE
          TRUE ONE HERE. Fleet, supplier and insurance all warn that most of the
          workspace is not built yet. Towing IS built — migration 074 shipped all
          ten screens on 2026-08-09. Copying the warning across would have been a
          transcription error that told the truth about a different pack, which
          is exactly the class of defect this file's header is about. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
          lineHeight: 1.6,
          marginBottom: primitive.space[6],
        }}
      >
        The towing screens are ready — dispatch board, new requests, active and
        completed recoveries, drivers and recovery vehicles. Registering is the
        part that was missing: until now nothing could create a towing operator,
        so those screens belonged to a role nobody could hold.
      </p>

      <FormShell
        action={createTowingAction}
        successPrefix="Your company is"
        successHref={{ href: '/towing/operations/dashboard', label: 'Open your dashboard' }}
      >
        <Field
          label="Company name"
          hint="What your company is called. You can change it later."
          htmlFor="companyName"
        >
          <TextInput
            id="companyName"
            name="companyName"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Accra Recovery Services"
            autoFocus
          />
        </Field>

        <Field
          label="Head office"
          hint="Optional. Where your recovery vehicles are based — leave blank and we will name it for you."
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
        towing company.
      </p>
    </main>
  );
}
