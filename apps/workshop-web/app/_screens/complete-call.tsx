import { Field, FormShell, SubmitButton, TextInput } from '@autoworkshop/ui';
import { completeCallAction } from './calls-actions';

/**
 * Record what was agreed and close the call.
 *
 * 🔴 THE OUTCOME IS REQUIRED BY THE DATABASE, not merely by this form —
 * migration 049's `ck_completed_has_outcome`. A call marked done with no
 * outcome looks finished and nobody can tell whether it was useful, which is
 * the same rule slice 9 applies to a resolved support case.
 *
 * ⚠️ SHOWN ALONGSIDE THE LIVE CALL, not after it. Somebody who hangs up and
 * navigates away has already lost the detail; the box is there while they are
 * still on the call.
 */
export function CompleteCall({ callId, subject }: { callId: string; subject: string }) {
  return (
    <FormShell action={completeCallAction} successPrefix="Recorded">
      <input type="hidden" name="callId" value={callId} />
      <Field
        label={`What was agreed on "${subject}"?`}
        htmlFor={`outcome-${callId}`}
        hint="This is the part that outlives the call. It is kept against the job whether or not the video connected."
      >
        <TextInput id={`outcome-${callId}`} name="outcome" required maxLength={5000} />
      </Field>
      <SubmitButton>Record outcome and end call</SubmitButton>
    </FormShell>
  );
}
