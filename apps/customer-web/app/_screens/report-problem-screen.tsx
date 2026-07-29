import { apiGet, describeApiFailure } from '@autoworkshop/next-shell';
import {
  PageHeader,
  ErrorState,
  EmptyState,
  Field,
  FormShell,
  Select,
  SubmitButton,
} from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { reportProblemAction } from './report-problem-actions';

/**
 * Report a Problem — `01 (1).txt` §33, and the customer's way into the repair
 * lifecycle.
 *
 * What it produces is a JOB CARD at stage "complaint received"
 * (`1.txt` §322), not a separate complaint that someone must later convert. The
 * workshop sees it on their Job Cards screen the moment it is submitted.
 *
 * The vehicle list comes from the customer's own garage — `GET /vehicles`
 * already returns only theirs — so there is no picker of other people's cars to
 * mis-click, and the service re-checks ownership regardless.
 */

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string | null;
}

export async function ReportProblemScreen() {
  const vehicles = await apiGet<Vehicle[]>('customer', '/vehicles');

  const header = (
    <PageHeader
      title="Report a Problem"
      description="Tell your workshop what the vehicle is doing. This opens a job card they can act on."
    />
  );

  if (!vehicles.ok) {
    const { title, description } = describeApiFailure(vehicles.reason);
    return (
      <>
        {header}
        <ErrorState title={title} message={description} />
      </>
    );
  }

  if (vehicles.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="Add a vehicle first"
          description="A problem is reported against one of your vehicles, and there are none on your account yet."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <FormShell
        action={reportProblemAction}
        successPrefix="Reported — your job card is"
        successHref={{ href: '/home/dashboard', label: 'Back to your dashboard' }}
      >
        <Field label="Which vehicle?" htmlFor="vehicleId">
          <Select
            id="vehicleId"
            name="vehicleId"
            required
            options={vehicles.data.map((v) => ({
              value: v.id,
              label: `${v.registrationNumber} — ${v.make}${v.model ? ` ${v.model}` : ''}`,
            }))}
          />
        </Field>

        <Field
          label="What is it doing?"
          hint="Plain words are fine. When it happens, what you hear or feel, and whether it is getting worse."
          htmlFor="complaint"
        >
          {/* A textarea, not a single-line input: a complaint is prose, and a
              one-line box teaches people to write one line. `TextInput` is not
              used here because it renders an <input>. */}
          <textarea
            id="complaint"
            name="complaint"
            required
            rows={5}
            maxLength={4000}
            style={{
              width: '100%',
              padding: primitive.space[3],
              fontSize: primitive.fontSize.base,
              fontFamily: 'inherit',
              color: themeVar.textPrimary,
              background: themeVar.surfaceRaised,
              border: `1px solid ${themeVar.borderDefault}`,
              borderRadius: primitive.radius.md,
              resize: 'vertical',
            }}
          />
        </Field>

        <Field
          label="How urgent is it?"
          hint="Your workshop decides the final priority — this tells them how you see it."
          htmlFor="priority"
        >
          <Select
            id="priority"
            name="priority"
            defaultValue="normal"
            options={[
              { value: 'low', label: 'Not urgent — whenever suits' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'Urgent — I need the vehicle soon' },
              { value: 'urgent', label: 'Unsafe to drive' },
            ]}
          />
        </Field>

        {/* Named rather than hinted at with a disabled button. §537 asks for
            voice, photographs and video; none of it exists in this build, and a
            greyed-out camera icon would suggest otherwise. */}
        <p style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
          Photographs, voice notes and video are not available yet — describe it in words for now,
          and your workshop will ask if they need more.
        </p>

        <SubmitButton>Send to my workshop</SubmitButton>
      </FormShell>
    </>
  );
}
