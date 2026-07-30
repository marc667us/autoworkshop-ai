'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import {
  approveCriticalOverrideAction,
  recordRoadTestAction,
  recordScanAction,
  recordTestResultAction,
  removeTestResultAction,
  submitTestSessionAction,
} from './testing-actions';
import {
  OUTCOME_LABEL,
  ROAD_TEST_OUTCOME_LABEL,
  ROAD_TEST_OUTCOME_ORDER,
  TEST_CATEGORY_LABEL,
  TEST_CATEGORY_ORDER,
} from './testing-labels';

/**
 * Recording post-repair tests — `07.txt` §34-§36.
 *
 * ⚠️ NOT THE AUTHORIZATION POINT and not the rule layer. Renders only when the API said
 * `editable`. §35's approval in particular is enforced in the service with a NARROWER
 * role set and by a CHECK constraint — the control below is offered to everyone, and the
 * API refuses whoever may not use it, because hiding it would leave a supervisor unable
 * to find the thing they alone can do.
 */

interface Result {
  id: string;
  position: number;
  testName: string;
  testCategory: string;
  outcome: string;
}

export function TestingRecordForm({
  sessionId,
  jobNumber,
  results,
  scan,
  roadTest,
  overrideApproved,
}: {
  sessionId: string;
  jobNumber: string;
  results: Result[];
  scan: {
    scanPerformed: boolean;
    preRepairFaultCodes: string | null;
    codesCleared: string | null;
    codesRemaining: string | null;
    newCodes: string | null;
    liveDataChecks: string | null;
    systemReadiness: string | null;
    warningLightStatus: string | null;
    criticalFaultsRemain: boolean;
  };
  roadTest: {
    roadTestPerformed: boolean;
    roadTestDriver: string | null;
    roadTestStartMileage: number | null;
    roadTestEndMileage: number | null;
    roadTestRoute: string | null;
    roadTestWeather: string | null;
    roadTestRoadCondition: string | null;
    roadTestInitialSymptom: string | null;
    roadTestOutcome: string | null;
    roadTestNotes: string | null;
  };
  overrideApproved: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [outcome, setOutcome] = React.useState<'pass' | 'fail'>('pass');

  async function run(
    key: string,
    action: (d: FormData) => Promise<{ error?: string; created?: string }>,
    data: FormData,
  ): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await action(data);
      if (r.error) {
        setError(r.error);
        return false;
      }
      setNotice(r.created ?? 'Saved');
      // `revalidatePath` marks the server cache stale; it does not repaint the page.
      router.refresh();
      return true;
    } catch {
      setError('The request could not be completed. Nothing was recorded.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const blockedBy35 = scan.criticalFaultsRemain && !overrideApproved;
  const submitBlocked = results.length === 0 || blockedBy35;

  return (
    <div style={{ display: 'grid', gap: primitive.space[6] }}>
      {notice ? (
        <p role="status" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
          {error}
        </p>
      ) : null}

      {/* ── §34: RECORD A TEST ─────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Record a test</h2>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            d.set('sessionId', sessionId);
            d.set('outcome', outcome);
            if (await run('result', recordTestResultAction, d)) form.reset();
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <div style={twoUp}>
            <Field label="What kind of test *" htmlFor="t-cat">
              <select id="t-cat" name="testCategory" defaultValue="visual_inspection" style={input}>
                {TEST_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{TEST_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </Field>
            <Field label="Which test *" htmlFor="t-name">
              <input id="t-name" name="testName" maxLength={300} placeholder="Offside front brake efficiency" style={input} />
            </Field>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', gap: primitive.space[3], flexWrap: 'wrap' }}>
            <legend style={{ ...labelStyle, padding: 0 }}>Result *</legend>
            {(['pass', 'fail'] as const).map((o) => (
              <label key={o} style={{ display: 'flex', gap: primitive.space[1], alignItems: 'center', fontSize: primitive.fontSize.sm, color: themeVar.textPrimary }}>
                <input type="radio" name="outcomeChoice" checked={outcome === o} onChange={() => setOutcome(o)} />
                {OUTCOME_LABEL[o]}
              </label>
            ))}
          </fieldset>

          <div style={twoUp}>
            <Field label="Expected" htmlFor="t-exp">
              <input id="t-exp" name="expectedResult" maxLength={2000} style={input} />
            </Field>
            <Field
              label={outcome === 'fail' ? 'What actually happened *' : 'What actually happened'}
              htmlFor="t-act"
              note={outcome === 'fail' ? 'Required for a failure, unless you add a comment — quality control cannot act on “fail” alone.' : undefined}
            >
              <input id="t-act" name="actualResult" maxLength={2000} style={input} />
            </Field>
          </div>

          <div style={twoUp}>
            <Field label="Unit" htmlFor="t-unit">
              <input id="t-unit" name="unitOfMeasurement" maxLength={50} placeholder="%" style={input} />
            </Field>
            <Field label="Equipment" htmlFor="t-eq">
              <input id="t-eq" name="testEquipment" maxLength={300} style={input} />
            </Field>
          </div>

          <div style={twoUp}>
            <Field label="Equipment identifier" htmlFor="t-eqid">
              <input id="t-eqid" name="equipmentIdentifier" maxLength={200} style={input} />
            </Field>
            <Field
              label="Calibration status"
              htmlFor="t-cal"
              // §34 names it explicitly, and it is the field most likely to be dropped as
              // bureaucracy — a reading from an uncalibrated gauge is not evidence.
              note="A reading from an uncalibrated gauge is not evidence."
            >
              <input id="t-cal" name="calibrationStatus" maxLength={300} placeholder="Calibrated 2026-06-01" style={input} />
            </Field>
          </div>

          <Field label="Comments" htmlFor="t-comm">
            <input id="t-comm" name="comments" maxLength={8000} style={input} />
          </Field>

          <button type="submit" disabled={busy !== null} style={primary(busy === 'result')}>
            {busy === 'result' ? 'Recording…' : 'Record test'}
          </button>
        </form>

        {results.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: `${primitive.space[3]} 0 0 0`, display: 'grid', gap: primitive.space[1] }}>
            {results.map((r) => (
              <li key={r.id} style={{ display: 'flex', gap: primitive.space[2], alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: r.outcome === 'fail' ? primitive.color.red[700] : themeVar.textPrimary, fontWeight: 600, fontSize: primitive.fontSize.sm }}>
                  {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                </span>
                <span style={{ color: themeVar.textPrimary, fontSize: primitive.fontSize.sm }}>{r.testName}</span>
                <form
                  noValidate
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const d = new FormData();
                    d.set('sessionId', sessionId);
                    d.set('resultId', r.id);
                    await run(`rm-${r.id}`, removeTestResultAction, d);
                  }}
                >
                  <button
                    type="submit"
                    disabled={busy !== null}
                    // `aria-label` rather than a hidden span — an attribute has no layout.
                    aria-label={`Remove the result for ${r.testName}`}
                    style={danger}
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── §35: THE POST-REPAIR SCAN ──────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Post-repair diagnostic scan</h2>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('sessionId', sessionId);
            await run('scan', recordScanAction, d);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <label style={checkRow}>
            <input type="checkbox" name="scanPerformed" defaultChecked={scan.scanPerformed} />
            A post-repair scan was carried out
          </label>
          <div style={twoUp}>
            <Field label="Codes before the repair" htmlFor="s-pre">
              <input id="s-pre" name="preRepairFaultCodes" maxLength={2000} defaultValue={scan.preRepairFaultCodes ?? ''} style={input} />
            </Field>
            <Field label="Codes cleared" htmlFor="s-cleared">
              <input id="s-cleared" name="codesCleared" maxLength={2000} defaultValue={scan.codesCleared ?? ''} style={input} />
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Codes remaining" htmlFor="s-remaining">
              <input id="s-remaining" name="codesRemaining" maxLength={2000} defaultValue={scan.codesRemaining ?? ''} style={input} />
            </Field>
            <Field
              label="New codes"
              htmlFor="s-new"
              // §35 names these separately from remaining ones, and the distinction is
              // the point: a code that was not there before is something the repair caused.
              note="A code that was not there before is something the repair caused."
            >
              <input id="s-new" name="newCodes" maxLength={2000} defaultValue={scan.newCodes ?? ''} style={input} />
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="System readiness" htmlFor="s-ready">
              <input id="s-ready" name="systemReadiness" maxLength={2000} defaultValue={scan.systemReadiness ?? ''} style={input} />
            </Field>
            <Field label="Warning lights" htmlFor="s-lights">
              <input id="s-lights" name="warningLightStatus" maxLength={2000} defaultValue={scan.warningLightStatus ?? ''} style={input} />
            </Field>
          </div>
          <Field label="Live-data checks" htmlFor="s-live">
            <textarea id="s-live" name="liveDataChecks" rows={2} maxLength={8000} defaultValue={scan.liveDataChecks ?? ''} style={input} />
          </Field>
          <label style={{ ...checkRow, color: primitive.color.red[700], fontWeight: 600 }}>
            <input type="checkbox" name="criticalFaultsRemain" defaultChecked={scan.criticalFaultsRemain} />
            An unresolved CRITICAL fault remains
          </label>
          <p style={hint}>
            §35: if it does, this repair cannot go to quality control until a supervisor,
            manager or the owner approves the release and says why — and it cannot be your
            own approval.
          </p>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'scan')}>
            {busy === 'scan' ? 'Saving…' : 'Save scan'}
          </button>
        </form>
      </section>

      {/* ── §35's DOCUMENTED APPROVAL ──────────────────────────────────── */}
      {scan.criticalFaultsRemain && !overrideApproved ? (
        <section style={{ ...panel, borderColor: primitive.color.red[700] }}>
          <h2 style={heading}>Approve release with the fault present (§35)</h2>
          <p style={hint}>
            Only a supervisor, manager or the owner may do this, and not the person who
            recorded the fault. The reason below is the record a safety review reads.
          </p>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              d.set('sessionId', sessionId);
              await run('override', approveCriticalOverrideAction, d);
            }}
            style={{ display: 'grid', gap: primitive.space[2] }}
          >
            <Field label="Why may the vehicle be released? *" htmlFor="o-reason">
              <textarea
                id="o-reason"
                name="reason"
                rows={3}
                maxLength={8000}
                placeholder="Customer informed of the ABS fault and has agreed to return for it on 12 August."
                style={input}
              />
            </Field>
            <button type="submit" disabled={busy !== null} style={primary(busy === 'override')}>
              {busy === 'override' ? 'Approving…' : 'Approve the release'}
            </button>
          </form>
        </section>
      ) : null}

      {/* ── §36: THE ROAD TEST ─────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Road test</h2>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            d.set('sessionId', sessionId);
            await run('road', recordRoadTestAction, d);
          }}
          style={{ display: 'grid', gap: primitive.space[2] }}
        >
          <label style={checkRow}>
            <input type="checkbox" name="roadTestPerformed" defaultChecked={roadTest.roadTestPerformed} />
            A road test was carried out
          </label>
          <div style={twoUp}>
            <Field label="Who drove it" htmlFor="r-driver">
              <input id="r-driver" name="roadTestDriver" maxLength={300} defaultValue={roadTest.roadTestDriver ?? ''} style={input} />
            </Field>
            <Field label="Outcome" htmlFor="r-outcome">
              <select id="r-outcome" name="roadTestOutcome" defaultValue={roadTest.roadTestOutcome ?? ''} style={input}>
                <option value="">Not recorded</option>
                {ROAD_TEST_OUTCOME_ORDER.map((o) => (
                  <option key={o} value={o}>{ROAD_TEST_OUTCOME_LABEL[o]}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Start mileage" htmlFor="r-start">
              <input id="r-start" name="roadTestStartMileage" inputMode="numeric"
                defaultValue={roadTest.roadTestStartMileage === null ? '' : String(roadTest.roadTestStartMileage)} style={input} />
            </Field>
            <Field label="End mileage" htmlFor="r-end">
              <input id="r-end" name="roadTestEndMileage" inputMode="numeric"
                defaultValue={roadTest.roadTestEndMileage === null ? '' : String(roadTest.roadTestEndMileage)} style={input} />
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Route" htmlFor="r-route">
              <input id="r-route" name="roadTestRoute" maxLength={500} defaultValue={roadTest.roadTestRoute ?? ''} style={input} />
            </Field>
            <Field label="Weather" htmlFor="r-weather">
              <input id="r-weather" name="roadTestWeather" maxLength={200} defaultValue={roadTest.roadTestWeather ?? ''} style={input} />
            </Field>
          </div>
          <div style={twoUp}>
            <Field label="Road condition" htmlFor="r-road">
              <input id="r-road" name="roadTestRoadCondition" maxLength={200} defaultValue={roadTest.roadTestRoadCondition ?? ''} style={input} />
            </Field>
            <Field label="Symptom before the test" htmlFor="r-symptom">
              <input id="r-symptom" name="roadTestInitialSymptom" maxLength={2000} defaultValue={roadTest.roadTestInitialSymptom ?? ''} style={input} />
            </Field>
          </div>
          <p style={hint}>
            A road test recorded as carried out must name the driver, both odometer
            readings and an outcome before the session can be submitted — half a road test
            is not evidence the car was driven.
          </p>
          <button type="submit" disabled={busy !== null} style={primary(busy === 'road')}>
            {busy === 'road' ? 'Saving…' : 'Save road test'}
          </button>
        </form>
      </section>

      {/* ── SUBMIT ─────────────────────────────────────────────────────── */}
      <section style={panel}>
        <h2 style={heading}>Submit for quality control</h2>
        {submitBlocked ? (
          // Says WHICH rule and what to do, rather than disabling a control in silence.
          <p style={{ margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.sm, color: primitive.color.red[700] }}>
            {results.length === 0
              ? 'Record at least one test first — a test that FAILED is a result too.'
              : '§35: a supervisor, manager or the owner must approve the release while a critical fault remains.'}
          </p>
        ) : null}
        <p style={hint}>
          Once submitted the results are frozen. An inspection that the person who did the
          work could edit would not be independent (§563).
        </p>
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData();
            d.set('sessionId', sessionId);
            await run('submit', submitTestSessionAction, d);
          }}
        >
          <button
            type="submit"
            disabled={busy !== null || submitBlocked}
            aria-label={`Submit the test results for job card ${jobNumber} to quality control`}
            style={primary(busy === 'submit', submitBlocked)}
          >
            {busy === 'submit' ? 'Submitting…' : 'Submit to quality control'}
          </button>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  note,
  children,
}: {
  label: string;
  htmlFor: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: primitive.space[1], minWidth: 0 }}>
      {/* A REAL <label>, never `visuallyHidden` — that class is `position: absolute` and
          escapes any ancestor that is not positioned. */}
      <label htmlFor={htmlFor} style={labelStyle}>{label}</label>
      {note ? (
        <p style={{ margin: 0, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary }}>{note}</p>
      ) : null}
      {children}
    </div>
  );
}

const labelStyle = { fontSize: primitive.fontSize.sm, fontWeight: 600, color: themeVar.textPrimary };
const panel = {
  padding: primitive.space[4],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  position: 'relative' as const,
};
const heading = { margin: `0 0 ${primitive.space[2]} 0`, fontSize: primitive.fontSize.base, color: themeVar.textPrimary };
const hint = { margin: `0 0 ${primitive.space[3]} 0`, fontSize: primitive.fontSize.sm, color: themeVar.textSecondary };
const checkRow = {
  display: 'flex',
  gap: primitive.space[2],
  alignItems: 'center',
  fontSize: primitive.fontSize.sm,
  color: themeVar.textPrimary,
};
const twoUp = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))',
  gap: primitive.space[2],
  minWidth: 0,
};
const input = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box' as const,
  padding: primitive.space[2],
  fontSize: primitive.fontSize.sm,
  fontFamily: 'inherit',
  color: themeVar.textPrimary,
  background: themeVar.surfaceRaised,
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
};
function primary(busy: boolean, blocked = false) {
  return {
    padding: primitive.space[2],
    fontSize: primitive.fontSize.sm,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: primitive.color.grey[0],
    background: busy || blocked ? primitive.color.grey[400] : primitive.color.blue[600],
    border: 'none',
    borderRadius: primitive.radius.md,
    cursor: busy ? ('progress' as const) : blocked ? ('not-allowed' as const) : ('pointer' as const),
    justifySelf: 'start' as const,
  };
}
const danger = {
  padding: primitive.space[1],
  fontSize: primitive.fontSize.sm,
  fontWeight: 600,
  fontFamily: 'inherit',
  color: primitive.color.red[700],
  background: 'transparent',
  border: `1px solid ${primitive.color.red[700]}`,
  borderRadius: primitive.radius.md,
  cursor: 'pointer' as const,
};
