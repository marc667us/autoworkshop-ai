'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import {
  addFindingAction,
  recordDiagnosisSummaryAction,
  removeFindingAction,
  setFindingStatusAction,
  submitDiagnosisAction,
  updateFindingDetailsAction,
} from './diagnosis-actions';
// From the pure label module, NEVER from `diagnosis-sheet-screen` — that is an async
// server component, and importing a constant out of it would pull the module and its
// API client into the client bundle.
import {
  AFFECTED_SYSTEM_LABEL,
  AFFECTED_SYSTEM_ORDER,
  FINDING_STATUS_KIND,
  FINDING_STATUS_LABEL,
  FINDING_STATUS_ORDER,
} from './diagnosis-labels';

/**
 * Recording a diagnosis — `07.txt` §3026-§3046.
 *
 * ── FOUR SEPARATE FORMS, NOT ONE ───────────────────────────────────────────
 *
 * Add a finding · change a finding's standing · save the notes · submit. Each is its
 * own `<form>`, and that is a correctness requirement rather than tidiness: two
 * submit buttons in one form make Enter ambiguous, and a technician typing in a
 * multi-line interpretation field WILL press Enter. Slice 3a separated save from
 * submit for the same reason; here there are four transitions to keep apart, and the
 * worst possible accident is submitting a half-written diagnosis for review.
 *
 * ── WHY ADDING A FINDING IS A FULL FORM AND CHANGING ONE IS A SELECT ────────
 *
 * A finding is written once, as several sentences of reasoning. Its STANDING then
 * changes repeatedly as testing progresses — suspected becomes confirmed or excluded
 * — so that one field gets a control per finding, and the rest does not. The
 * confirmation signature §1294 requires is applied server-side from the caller's
 * identity; this form cannot name a confirmer, by design.
 */

interface DiagnosticFinding {
  id: string;
  position: number;
  faultCode: string | null;
  faultDescription: string;
  affectedSystem: string;
  affectedSystemLabel: string;
  observedSymptom: string | null;
  testPerformed: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  interpretation: string | null;
  findingStatus: string;
  source: string;
  confirmedByName: string | null;
  additionalInspectionRequired: boolean;
  recordedByName: string | null;
}

type Pending = 'add' | 'summary' | 'submit' | string | null;

export function DiagnosisFindingsForm({
  diagnosisId,
  jobNumber,
  findings,
  summary,
}: {
  diagnosisId: string;
  jobNumber: string;
  findings: DiagnosticFinding[];
  summary: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const addFormRef = React.useRef<HTMLFormElement>(null);

  async function run(
    kind: Pending,
    action: (data: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
    onDone?: () => void,
  ) {
    setPending(kind);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action(data);
      if (outcome.error) {
        setError(outcome.error);
      } else {
        setNotice(outcome.created ?? 'Saved');
        onDone?.();
        // Re-fetch the server component: the findings list, the derived counts and —
        // after a submit — the whole read-only view come from the server.
        // `revalidatePath` in the action alone does not repaint a page already on screen.
        router.refresh();
      }
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {/* Announcements live OUTSIDE every form, so a submit that replaces the forms
          below does not take the message with it.

          ⚠️ Scoped `role` on a specific element rather than a bare page-level live
          region: an unscoped `[role="status"]` also matches the shell's own empty live
          region, which once made a working write report as a failure in a test. */}
      {error ? (
        <p
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: primitive.color.red[700],
            fontSize: primitive.fontSize.sm,
          }}
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          style={{
            margin: `0 0 ${primitive.space[3]} 0`,
            color: themeVar.textPrimary,
            fontSize: primitive.fontSize.sm,
          }}
        >
          {notice}
        </p>
      ) : null}

      {/* ── the findings recorded so far ──────────────────────────────────── */}
      <h2 style={heading}>
        Findings{findings.length > 0 ? ` (${findings.length})` : ''}
      </h2>

      {findings.length === 0 ? (
        <p style={{ color: themeVar.textSecondary, margin: `0 0 ${primitive.space[4]} 0` }}>
          {/* An empty state that says what to do, and names §1290's third option —
              without it the screen reads as "you must find something wrong", which
              invents faults. */}
          Nothing recorded yet. Add each fault you find below. A fault you have ruled out
          is also a finding — record it as excluded, so the test is not lost.
        </p>
      ) : (
        <ol
          style={{
            listStyle: 'none',
            padding: 0,
            margin: `0 0 ${primitive.space[4]} 0`,
            display: 'grid',
            gap: primitive.space[3],
          }}
        >
          {findings.map((finding) => (
            <li
              key={finding.id}
              style={{
                padding: primitive.space[3],
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: primitive.radius.md,
                background: themeVar.surfaceRaised,
                // Positioned containing block for the visually-hidden labels below.
                // Without it they resolve against the initial containing block and can
                // stretch the document — measured at 23px in slice 3a and 4906px in
                // slice 2. Fix the ANCESTOR, never the label.
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: primitive.space[2],
                  alignItems: 'baseline',
                  marginBottom: primitive.space[2],
                }}
              >
                <StatusBadge
                  kind={FINDING_STATUS_KIND[finding.findingStatus] ?? 'draft'}
                  label={FINDING_STATUS_LABEL[finding.findingStatus] ?? finding.findingStatus}
                />
                <strong style={{ color: themeVar.textPrimary }}>{finding.faultDescription}</strong>
                {finding.faultCode ? (
                  <code
                    style={{
                      fontFamily: primitive.fontFamily.mono,
                      color: themeVar.textSecondary,
                      fontSize: primitive.fontSize.sm,
                    }}
                  >
                    {finding.faultCode}
                  </code>
                ) : null}
                <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  {finding.affectedSystemLabel}
                </span>
              </div>

              {/* The reasoning, when there is any. Rendered as plain text rather than
                  fields: it is what a supervisor reads, and this form's job is to let
                  the STANDING change, not to re-edit prose mid-shift. */}
              {finding.testPerformed || finding.actualResult || finding.interpretation ? (
                <p
                  style={{
                    margin: `0 0 ${primitive.space[2]} 0`,
                    color: themeVar.textSecondary,
                    fontSize: primitive.fontSize.sm,
                  }}
                >
                  {[
                    finding.observedSymptom ? `Symptom: ${finding.observedSymptom}` : null,
                    finding.testPerformed ? `Test: ${finding.testPerformed}` : null,
                    finding.expectedResult ? `Expected: ${finding.expectedResult}` : null,
                    finding.actualResult ? `Actual: ${finding.actualResult}` : null,
                    finding.interpretation ? `Interpretation: ${finding.interpretation}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: primitive.space[2],
                  alignItems: 'flex-end',
                }}
              >
                {/* Standing — its own form, one field. */}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      `status:${finding.id}`,
                      setFindingStatusAction,
                      new FormData(event.currentTarget),
                    );
                  }}
                  noValidate
                  style={{ display: 'flex', gap: primitive.space[1], alignItems: 'flex-end' }}
                >
                  <input type="hidden" name="diagnosisId" value={diagnosisId} />
                  <input type="hidden" name="findingId" value={finding.id} />
                  <div>
                    <label htmlFor={`status-${finding.id}`} style={visuallyHidden}>
                      Standing for {finding.faultDescription}
                    </label>
                    <select
                      id={`status-${finding.id}`}
                      name="findingStatus"
                      // UNCONTROLLED, with `defaultValue`. The server is the source of
                      // truth and `router.refresh()` re-renders with the saved value;
                      // React state here would mean a rejected save leaves the screen
                      // showing a standing the API does not have.
                      defaultValue={finding.findingStatus}
                      style={{ ...inputStyle, width: 'auto' }}
                    >
                      {FINDING_STATUS_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {FINDING_STATUS_LABEL[value]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={pending !== null}
                    style={secondaryButton(pending === `status:${finding.id}`)}
                  >
                    {pending === `status:${finding.id}` ? 'Saving…' : 'Update standing'}
                  </button>
                </form>

                {/* ⚠️ REMOVE — the escape hatch for a finding entered in error, and it
                    exists because every alternative is worse. `excluded` means "a fault
                    I ruled out" (§1290), so recording a typo as one puts a false
                    statement in the record; a second attempt cannot be started while
                    this one is open. Without this a wrong finding stands for good — the
                    unreachable-alternative trap slice 3a paid for.

                    Only while the diagnosis is open. The service and a database trigger
                    both refuse it afterwards. */}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      `remove:${finding.id}`,
                      removeFindingAction,
                      new FormData(event.currentTarget),
                    );
                  }}
                  noValidate
                >
                  <input type="hidden" name="diagnosisId" value={diagnosisId} />
                  <input type="hidden" name="findingId" value={finding.id} />
                  <button
                    type="submit"
                    disabled={pending !== null}
                    // Names WHICH finding in the accessible name — a column of
                    // identical "Remove" buttons is indistinguishable to a screen
                    // reader (§66). An attribute rather than a hidden span: an
                    // attribute has no layout and cannot escape a scroll container.
                    aria-label={`Remove the finding “${finding.faultDescription}”, entered in error`}
                    style={{
                      ...secondaryButton(pending === `remove:${finding.id}`),
                      color: primitive.color.red[700],
                    }}
                  >
                    {pending === `remove:${finding.id}` ? 'Removing…' : 'Remove'}
                  </button>
                </form>
              </div>

              {/*
                ⚠️ CORRECTING THE DETAILS — and it has to be reachable from here, not
                only from the API (Codex MEDIUM, accepted). A fault code typed against
                a fault that turns out to set none, or a mistyped expected value, was
                otherwise fixable ONLY by removing the whole finding and retyping the
                reasoning: destroying the record around a field in order to fix that
                field. An API that can clear a column and a product that cannot is
                half a feature.

                Behind a `<details>` disclosure so the list stays scannable — a
                technician reads this list far more often than they correct it — and
                because a native disclosure needs no focus plumbing and is keyboard-
                and screen-reader-operable as it stands.

                An EMPTIED field is sent as `null` by the action, which the service
                reads as "clear this". That is why blanking a box here actually removes
                the value instead of silently doing nothing.
              */}
              <details style={{ marginTop: primitive.space[2] }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    fontSize: primitive.fontSize.sm,
                    color: primitive.color.blue[600],
                    fontWeight: 600,
                  }}
                >
                  Correct the details
                </summary>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    if (!form.checkValidity()) {
                      form.reportValidity();
                      return;
                    }
                    void run(
                      `edit:${finding.id}`,
                      updateFindingDetailsAction,
                      new FormData(form),
                    );
                  }}
                  noValidate
                  style={{
                    display: 'grid',
                    gap: primitive.space[2],
                    marginTop: primitive.space[2],
                  }}
                >
                  <input type="hidden" name="diagnosisId" value={diagnosisId} />
                  <input type="hidden" name="findingId" value={finding.id} />

                  <label htmlFor={`d-desc-${finding.id}`} style={labelStyle}>
                    Fault description (required)
                  </label>
                  <input
                    id={`d-desc-${finding.id}`}
                    name="faultDescription"
                    type="text"
                    required
                    maxLength={2000}
                    defaultValue={finding.faultDescription}
                    style={inputStyle}
                  />

                  <label htmlFor={`d-system-${finding.id}`} style={labelStyle}>
                    Affected system (required)
                  </label>
                  <select
                    id={`d-system-${finding.id}`}
                    name="affectedSystem"
                    required
                    defaultValue={finding.affectedSystem}
                    style={inputStyle}
                  >
                    {AFFECTED_SYSTEM_ORDER.map((value) => (
                      <option key={value} value={value}>
                        {AFFECTED_SYSTEM_LABEL[value]}
                      </option>
                    ))}
                  </select>

                  {/* The clearable fields. The hint is not decoration: without it,
                      emptying a box looks like it might do nothing. */}
                  <p style={hintStyle}>
                    Emptying any field below removes its value. The description and the
                    affected system cannot be emptied.
                  </p>

                  {(
                    [
                      ['faultCode', 'Fault code', finding.faultCode],
                      ['observedSymptom', 'Observed symptom', finding.observedSymptom],
                      ['testPerformed', 'Test performed', finding.testPerformed],
                      ['expectedResult', 'Expected result', finding.expectedResult],
                      ['actualResult', 'Actual result', finding.actualResult],
                    ] as const
                  ).map(([name, label, value]) => (
                    <React.Fragment key={name}>
                      <label htmlFor={`d-${name}-${finding.id}`} style={labelStyle}>
                        {label}
                      </label>
                      <input
                        id={`d-${name}-${finding.id}`}
                        name={name}
                        type="text"
                        maxLength={name === 'faultCode' ? 64 : 2000}
                        defaultValue={value ?? ''}
                        style={
                          name === 'faultCode'
                            ? { ...inputStyle, fontFamily: primitive.fontFamily.mono }
                            : inputStyle
                        }
                      />
                    </React.Fragment>
                  ))}

                  <label htmlFor={`d-interp-${finding.id}`} style={labelStyle}>
                    Interpretation
                  </label>
                  <textarea
                    id={`d-interp-${finding.id}`}
                    name="interpretation"
                    rows={3}
                    maxLength={8000}
                    defaultValue={finding.interpretation ?? ''}
                    style={inputStyle}
                  />

                  <label
                    style={{
                      ...labelStyle,
                      display: 'flex',
                      gap: primitive.space[2],
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      name="additionalInspectionRequired"
                      defaultChecked={finding.additionalInspectionRequired}
                    />
                    Needs further inspection (§3046)
                  </label>

                  <button
                    type="submit"
                    disabled={pending !== null}
                    style={buttonStyle(pending === `edit:${finding.id}`)}
                  >
                    {pending === `edit:${finding.id}` ? 'Saving…' : 'Save corrections'}
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ol>
      )}

      {/* ── add a finding ─────────────────────────────────────────────────── */}
      <h2 style={heading}>Add a finding</h2>

      <form
        ref={addFormRef}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          if (!form.checkValidity()) {
            form.reportValidity();
            return;
          }
          // Cleared only on success, so a rejected submission keeps everything the
          // technician typed. Losing a paragraph of reasoning to a validation error is
          // the fastest way to make people stop writing them.
          void run('add', addFindingAction, new FormData(form), () => form.reset());
        }}
        noValidate
        style={{ display: 'grid', gap: primitive.space[2], maxWidth: '42rem' }}
      >
        <input type="hidden" name="diagnosisId" value={diagnosisId} />

        <label htmlFor="faultDescription" style={labelStyle}>
          Fault description (required)
        </label>
        <input
          id="faultDescription"
          name="faultDescription"
          type="text"
          required
          maxLength={2000}
          placeholder="Cylinder 1 ignition coil open circuit"
          style={inputStyle}
        />

        <label htmlFor="affectedSystem" style={labelStyle}>
          Affected system (required)
        </label>
        <select id="affectedSystem" name="affectedSystem" required defaultValue="" style={inputStyle}>
          {/* An empty first option rather than a pre-selected category: defaulting to
              "Electrical" would have technicians filing mechanical faults as
              electrical whenever they forgot the field. */}
          <option value="">Choose a system…</option>
          {AFFECTED_SYSTEM_ORDER.map((value) => (
            <option key={value} value={value}>
              {AFFECTED_SYSTEM_LABEL[value]}
            </option>
          ))}
        </select>

        <label htmlFor="faultCode" style={labelStyle}>
          Fault code (optional — many faults set none)
        </label>
        <input
          id="faultCode"
          name="faultCode"
          type="text"
          maxLength={64}
          placeholder="P0301"
          style={{ ...inputStyle, fontFamily: primitive.fontFamily.mono }}
        />

        <label htmlFor="observedSymptom" style={labelStyle}>
          Observed symptom
        </label>
        <input
          id="observedSymptom"
          name="observedSymptom"
          type="text"
          maxLength={2000}
          placeholder="Rough idle, misfire under load"
          style={inputStyle}
        />

        {/* §3036-§3040 — the measurement record for this slice. Grouped in a fieldset
            because the three only mean anything together: a test with no expected value
            proves nothing, and an actual with no test is an assertion. */}
        <fieldset
          style={{
            display: 'grid',
            gap: primitive.space[2],
            border: `1px solid ${themeVar.borderDefault}`,
            borderRadius: primitive.radius.md,
            padding: primitive.space[3],
            margin: 0,
          }}
        >
          <legend style={{ ...labelStyle, padding: `0 ${primitive.space[1]}` }}>
            Test evidence
          </legend>

          <label htmlFor="testPerformed" style={labelStyle}>
            Test performed
          </label>
          <input
            id="testPerformed"
            name="testPerformed"
            type="text"
            maxLength={2000}
            placeholder="Coil primary resistance, multimeter across pins 1-2"
            style={inputStyle}
          />

          <label htmlFor="expectedResult" style={labelStyle}>
            Expected result
          </label>
          <input
            id="expectedResult"
            name="expectedResult"
            type="text"
            maxLength={2000}
            placeholder="0.4–0.6 ohm"
            style={inputStyle}
          />

          <label htmlFor="actualResult" style={labelStyle}>
            Actual result
          </label>
          <input
            id="actualResult"
            name="actualResult"
            type="text"
            maxLength={2000}
            placeholder="Open circuit"
            style={inputStyle}
          />
        </fieldset>

        <label htmlFor="interpretation" style={labelStyle}>
          Interpretation
        </label>
        <textarea
          id="interpretation"
          name="interpretation"
          rows={3}
          maxLength={8000}
          placeholder="What the result means, and what it rules in or out."
          style={inputStyle}
        />

        <label htmlFor="findingStatus" style={labelStyle}>
          Standing
        </label>
        <select
          id="findingStatus"
          name="findingStatus"
          // `suspected` is the honest default mid-diagnosis, and it matches the
          // column default. Defaulting to `confirmed` would turn every hunch into an
          // established fault — and a confirmed fault is what a customer is charged
          // for.
          defaultValue="suspected"
          style={inputStyle}
        >
          {FINDING_STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {FINDING_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        <p style={hintStyle}>
          Confirming a fault records YOUR name against it (§1294), so a confirmed fault can
          always answer who established it. Leave it as suspected until a test proves it.
        </p>

        <label style={{ ...labelStyle, display: 'flex', gap: primitive.space[2], alignItems: 'center' }}>
          <input type="checkbox" name="additionalInspectionRequired" />
          Needs further inspection (§3046)
        </label>

        <button type="submit" disabled={pending !== null} style={buttonStyle(pending === 'add')}>
          {/* The label changes, not only the colour (§66). */}
          {pending === 'add' ? 'Recording…' : 'Record finding'}
        </button>
      </form>

      {/* ── notes ─────────────────────────────────────────────────────────── */}
      <h2 style={heading}>Technician notes</h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run('summary', recordDiagnosisSummaryAction, new FormData(event.currentTarget));
        }}
        noValidate
        style={{ display: 'grid', gap: primitive.space[2], maxWidth: '42rem' }}
      >
        <input type="hidden" name="diagnosisId" value={diagnosisId} />
        <label htmlFor="summary" style={visuallyHidden}>
          Technician notes for job card {jobNumber}
        </label>
        <textarea
          id="summary"
          name="summary"
          rows={4}
          maxLength={8000}
          defaultValue={summary ?? ''}
          placeholder="Overall interpretation, anything the individual findings do not cover."
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={pending !== null}
          style={buttonStyle(pending === 'summary')}
        >
          {pending === 'summary' ? 'Saving…' : 'Save notes'}
        </button>
      </form>

      {/* ── submit for review ─────────────────────────────────────────────── */}
      {/* Its OWN form carrying only the id, so it cannot send half-typed findings and
          Enter inside a textarea above can never trigger it. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run('submit', submitDiagnosisAction, new FormData(event.currentTarget));
        }}
        noValidate
        style={{ marginTop: primitive.space[4], maxWidth: '42rem' }}
      >
        <input type="hidden" name="diagnosisId" value={diagnosisId} />
        <p style={{ margin: `0 0 ${primitive.space[2]} 0`, ...hintStyle }}>
          {findings.length === 0
            ? 'Record at least one finding before submitting — a diagnosis with none asks a supervisor to approve silence.'
            : 'Submitting sends this diagnosis for supervisor review (§1292). The findings are frozen at that point so the evidence cannot move underneath the reviewer, and a further opinion is a new attempt.'}
        </p>
        <button
          type="submit"
          // NOT disabled when empty. The API is the authority on whether the diagnosis
          // may be submitted and its refusal explains that a ruled-out fault counts as
          // a finding — more useful than a dead button that explains nothing. The
          // sentence above says what will happen either way.
          disabled={pending !== null}
          style={buttonStyle(pending === 'submit')}
        >
          {pending === 'submit' ? 'Submitting…' : 'Submit for review'}
        </button>
      </form>
    </>
  );
}

const heading = {
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
};

const labelStyle = {
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  color: themeVar.textPrimary,
};

const hintStyle = {
  fontSize: primitive.fontSize.sm,
  color: themeVar.textSecondary,
};

const inputStyle = {
  width: '100%',
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};

function buttonStyle(busy: boolean) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}

function secondaryButton(busy: boolean) {
  return {
    padding: primitive.space[1],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: themeVar.textPrimary,
    background: busy ? primitive.color.grey[200] : 'transparent',
    border: `1px solid ${themeVar.borderDefault}`,
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : ('pointer' as const),
  };
}
