import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { createWorkshopAction } from './create-workshop-actions';

/**
 * "Create your workshop" — what a signed-up person sees before they belong
 * anywhere. `07.txt` part 2 §5.
 *
 * ⚠️ IT REPLACES THE PAGE RATHER THAN REDIRECTING TO ONE, and that is a
 * deliberate choice about failure modes, not a shortcut. A redirect needs a
 * condition on the onboarding route to send finished users away again, and the
 * two conditions are then free to disagree — which is a redirect loop, on the
 * very first screen a new user ever reaches, with no way out but clearing
 * cookies. Rendering in place has one condition and therefore cannot loop.
 *
 * It is mounted in workshop-web's layout ONLY. A customer with no workshop is
 * not an incomplete workshop owner — they are a customer, and `customer-web`
 * must keep showing them the marketplace. Putting this in the shared shell
 * would demand every parts buyer register a garage.
 */
export function CreateWorkshopScreen({ displayName }: { displayName?: string }) {
  return (
    <main
      style={{
        maxWidth: '38rem',
        margin: '0 auto',
        padding: primitive.space[8],
      }}
    >
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
          worry here is that something went wrong during sign-up — their account
          works perfectly and the application looks empty, which is exactly what
          a failure would look like too. Naming it removes the doubt. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.sm,
          lineHeight: 1.6,
          marginBottom: primitive.space[6],
        }}
      >
        Your account is ready. It is not attached to a workshop yet, which is why
        there is nothing on your dashboard. Name your workshop below and you will
        be its owner — job cards, staff, customers and vehicles all live inside
        it.
      </p>

      <FormShell
        action={createWorkshopAction}
        successPrefix="Your workshop is"
        successHref={{ href: '/home/dashboard', label: 'Open your dashboard' }}
      >
        <Field
          label="Workshop name"
          hint="What your customers call you. You can change it later."
          htmlFor="workshopName"
        >
          <TextInput
            id="workshopName"
            name="workshopName"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. Abossey Okai Auto Clinic"
            autoFocus
          />
        </Field>

        <Field
          label="First branch"
          hint="Optional. Where the work happens — leave blank and we will call it Main branch."
          htmlFor="branchName"
        >
          <TextInput
            id="branchName"
            name="branchName"
            maxLength={120}
            placeholder="e.g. Osu"
          />
        </Field>

        {/* ⚠️ THE FORM SUPPLIES ITS OWN SUBMIT — `FormShell` renders `children`
            and nothing else. Omitting it produced a form with NO WAY TO SUBMIT,
            which typecheck, lint and `next build` all accepted: there is no
            type that says "a form needs a button". Caught only by a browser run
            trying to press one, where Playwright resolved the top bar's
            disabled "Create" placeholder instead and timed out on it. */}
        <SubmitButton>Create my workshop</SubmitButton>
      </FormShell>

      {/* ⚠️ NAMES THE ONE-WORKSHOP RULE BEFORE IT IS HIT, not after. The API
          refuses a second registration with a 409, and a rule a user only
          discovers by being refused reads as a bug. */}
      <p
        style={{
          color: themeVar.textSecondary,
          fontSize: primitive.fontSize.xs,
          marginTop: primitive.space[6],
        }}
      >
        One workshop per account. To join a workshop that already exists, ask its
        owner to add you instead — you will keep this same sign-in.
      </p>
    </main>
  );
}
