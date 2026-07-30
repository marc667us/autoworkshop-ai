import { Suspense } from 'react';
import Link from 'next/link';
import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { PageHeader, LoadingState, StatusBadge } from '@autoworkshop/ui';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import { TestingRecordForm } from './testing-record-form';
import {
  OUTCOME_KIND,
  OUTCOME_LABEL,
  ROAD_TEST_OUTCOME_LABEL,
  TEST_CATEGORY_LABEL,
  TEST_SESSION_STATUS_KIND,
  TEST_SESSION_STATUS_LABEL,
} from './testing-labels';

/**
 * One test session — `07.txt` §34-§36.
 *
 * ── §35's STATE IS THE FIRST THING ON THE PAGE ─────────────────────────────
 *
 * "The repair shall not be marked technically complete where an unresolved critical
 * fault remains without documented approval." Whether that applies here, and whether
 * the approval exists, decides if the car can go to quality control at all — so it is an
 * alert at the top rather than a field two thirds of the way down.
 */

interface Result {
  id: string;
  position: number;
  testCategory: string;
  testCategoryLabel: string;
  testName: string;
  testProcedure: string | null;
  testEquipment: string | null;
  equipmentIdentifier: string | null;
  calibrationStatus: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  unitOfMeasurement: string | null;
  outcome: string;
  comments: string | null;
  testedByName: string | null;
}

interface Session {
  id: string;
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  executionAttemptNo: number;
  attemptNo: number;
  status: 'in_progress' | 'submitted';
  scanPerformed: boolean;
  preRepairFaultCodes: string | null;
  codesCleared: string | null;
  codesRemaining: string | null;
  newCodes: string | null;
  liveDataChecks: string | null;
  systemReadiness: string | null;
  warningLightStatus: string | null;
  criticalFaultsRemain: boolean;
  overrideApprovedByName: string | null;
  overrideApprovedAt: string | null;
  overrideReason: string | null;
  roadTestPerformed: boolean;
  roadTestDriver: string | null;
  roadTestStartMileage: number | null;
  roadTestEndMileage: number | null;
  roadTestRoute: string | null;
  roadTestWeather: string | null;
  roadTestRoadCondition: string | null;
  roadTestInitialSymptom: string | null;
  roadTestOutcome: string | null;
  roadTestOutcomeLabel: string | null;
  roadTestNotes: string | null;
  submittedByName: string | null;
  results: Result[];
  passCount: number;
  failCount: number;
  roadTestDistance: number | null;
  editable: boolean;
}

export async function TestingSheetScreen({
  route,
  sessionId,
}: {
  route: string;
  sessionId: string;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading the test results…" />}>
      <Sheet route={route} sessionId={sessionId} />
    </Suspense>
  );
}

async function Sheet({ route, sessionId }: { route: string; sessionId: string }) {
  const result = await apiGet<Session>('workshop', `/test-sessions/${sessionId}`);
  if (!result.ok) return <ApiFailure reason={result.reason} workspaceId="workshop" />;
  const s = result.data;

  return (
    <>
      <PageHeader title={`Testing — ${s.jobNumber}`} description={describe(s)} />

      <p style={{ margin: `0 0 ${primitive.space[3]} 0` }}>
        <Link href={route} style={{ color: primitive.color.blue[600] }}>
          Back to the testing queue
        </Link>
      </p>

      {/* §35, FIRST — it decides whether this car can go anywhere. */}
      {s.criticalFaultsRemain ? (
        <div
          role="alert"
          style={{
            margin: `0 0 ${primitive.space[4]} 0`,
            padding: primitive.space[3],
            border: `1px solid ${primitive.color.red[700]}`,
            borderRadius: primitive.radius.md,
            background: themeVar.surfaceRaised,
          }}
        >
          <h2
            style={{
              margin: `0 0 ${primitive.space[1]} 0`,
              fontSize: primitive.fontSize.base,
              color: primitive.color.red[700],
            }}
          >
            An unresolved critical fault remains
          </h2>
          {s.overrideApprovedByName ? (
            <p style={{ margin: 0, color: themeVar.textPrimary }}>
              {/* The documented approval §35 asks for, shown in full — who, when, why. */}
              Release approved by <strong>{s.overrideApprovedByName}</strong>
              {s.overrideApprovedAt ? ` on ${new Date(s.overrideApprovedAt).toLocaleString()}` : ''}.
              {s.overrideReason ? ` ${s.overrideReason}` : ''}
            </p>
          ) : (
            <p style={{ margin: 0, color: themeVar.textPrimary }}>
              §35: this repair cannot go to quality control until a supervisor, manager or
              the owner approves the release and says why. It cannot be your own approval.
            </p>
          )}
        </div>
      ) : null}

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
          gap: primitive.space[3],
          margin: `0 0 ${primitive.space[4]} 0`,
        }}
      >
        <Fact label="Vehicle" value={s.registrationNumber} mono />
        <Fact
          label="Status"
          value={
            <StatusBadge
              kind={TEST_SESSION_STATUS_KIND[s.status] ?? 'draft'}
              label={TEST_SESSION_STATUS_LABEL[s.status] ?? s.status}
            />
          }
        />
        <Fact label="Attempt" value={String(s.attemptNo)} />
        <Fact label="Tests the repair" value={`Attempt ${s.executionAttemptNo}`} />
        <Fact
          label="Results"
          value={
            // Never a bare "0": before any test that means "nothing checked yet", and
            // after submission it would mean a car released untested.
            s.results.length === 0
              ? 'None recorded'
              : `${s.passCount} passed, ${s.failCount} failed`
          }
        />
        {s.roadTestPerformed ? (
          <Fact
            label="Road test"
            value={
              s.roadTestDistance !== null
                ? `${s.roadTestDistance} miles — ${s.roadTestOutcomeLabel ?? 'outcome not recorded'}`
                : 'Recorded, mileage incomplete'
            }
          />
        ) : null}
        {s.submittedByName ? <Fact label="Submitted by" value={s.submittedByName} /> : null}
      </dl>

      {s.editable ? (
        <TestingRecordForm
          sessionId={s.id}
          jobNumber={s.jobNumber}
          results={s.results}
          scan={{
            scanPerformed: s.scanPerformed,
            preRepairFaultCodes: s.preRepairFaultCodes,
            codesCleared: s.codesCleared,
            codesRemaining: s.codesRemaining,
            newCodes: s.newCodes,
            liveDataChecks: s.liveDataChecks,
            systemReadiness: s.systemReadiness,
            warningLightStatus: s.warningLightStatus,
            criticalFaultsRemain: s.criticalFaultsRemain,
          }}
          roadTest={{
            roadTestPerformed: s.roadTestPerformed,
            roadTestDriver: s.roadTestDriver,
            roadTestStartMileage: s.roadTestStartMileage,
            roadTestEndMileage: s.roadTestEndMileage,
            roadTestRoute: s.roadTestRoute,
            roadTestWeather: s.roadTestWeather,
            roadTestRoadCondition: s.roadTestRoadCondition,
            roadTestInitialSymptom: s.roadTestInitialSymptom,
            roadTestOutcome: s.roadTestOutcome,
            roadTestNotes: s.roadTestNotes,
          }}
          overrideApproved={s.overrideApprovedByName !== null}
        />
      ) : null}

      {/* The record, always — for an open session it is what has been entered so far,
          and for a submitted one it is what the inspector reads. */}
      <h2 style={sectionHeading}>Test results</h2>
      {s.results.length === 0 ? (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>
          {/* Never blank: an empty result list on a submitted session is an alarming
              state and should read as one. */}
          No tests have been recorded.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: primitive.space[2] }}>
          {s.results.map((r) => (
            <li key={r.id} style={record}>
              <div style={{ display: 'flex', gap: primitive.space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                <StatusBadge
                  kind={OUTCOME_KIND[r.outcome] ?? 'draft'}
                  label={OUTCOME_LABEL[r.outcome] ?? r.outcome}
                />
                <strong style={{ color: themeVar.textPrimary }}>{r.testName}</strong>
                <span style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
                  {TEST_CATEGORY_LABEL[r.testCategory] ?? r.testCategoryLabel}
                </span>
              </div>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
                  gap: primitive.space[2],
                  margin: `${primitive.space[2]} 0 0 0`,
                }}
              >
                {r.expectedResult ? <Fact label="Expected" value={r.expectedResult} /> : null}
                {r.actualResult ? (
                  <Fact
                    label="Actual"
                    value={`${r.actualResult}${r.unitOfMeasurement ? ` ${r.unitOfMeasurement}` : ''}`}
                  />
                ) : null}
                {r.testEquipment ? (
                  <Fact
                    label="Equipment"
                    value={`${r.testEquipment}${r.equipmentIdentifier ? ` (${r.equipmentIdentifier})` : ''}`}
                  />
                ) : null}
                {/* §34 names calibration status explicitly — a reading from an
                    uncalibrated gauge is not evidence. */}
                {r.calibrationStatus ? <Fact label="Calibration" value={r.calibrationStatus} /> : null}
                {r.testProcedure ? <Fact label="Procedure" value={r.testProcedure} /> : null}
                {r.comments ? <Fact label="Comments" value={r.comments} /> : null}
                <Fact label="Tested by" value={r.testedByName ?? 'Unknown'} />
              </dl>
            </li>
          ))}
        </ol>
      )}

      <h2 style={sectionHeading}>Post-repair scan (§35)</h2>
      {s.scanPerformed ? (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
            gap: primitive.space[3],
            margin: 0,
          }}
        >
          <Fact label="Codes before the repair" value={s.preRepairFaultCodes ?? 'Not recorded'} />
          <Fact label="Codes cleared" value={s.codesCleared ?? 'None'} />
          <Fact label="Codes remaining" value={s.codesRemaining ?? 'None'} />
          {/* §35 names NEW codes separately: one that was not there before is something
              the repair caused. */}
          <Fact label="New codes" value={s.newCodes ?? 'None'} />
          <Fact label="Live data" value={s.liveDataChecks ?? 'Not recorded'} />
          <Fact label="System readiness" value={s.systemReadiness ?? 'Not recorded'} />
          <Fact label="Warning lights" value={s.warningLightStatus ?? 'Not recorded'} />
        </dl>
      ) : (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>No post-repair scan was recorded.</p>
      )}

      <h2 style={sectionHeading}>Road test (§36)</h2>
      {s.roadTestPerformed ? (
        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
            gap: primitive.space[3],
            margin: 0,
          }}
        >
          <Fact label="Driver" value={s.roadTestDriver ?? 'Not recorded'} />
          <Fact
            label="Mileage"
            value={
              s.roadTestStartMileage !== null && s.roadTestEndMileage !== null
                ? `${s.roadTestStartMileage} → ${s.roadTestEndMileage} (${s.roadTestDistance} miles)`
                : 'Incomplete'
            }
          />
          <Fact label="Outcome" value={s.roadTestOutcomeLabel ?? 'Not recorded'} />
          {s.roadTestRoute ? <Fact label="Route" value={s.roadTestRoute} /> : null}
          {s.roadTestWeather ? <Fact label="Weather" value={s.roadTestWeather} /> : null}
          {s.roadTestRoadCondition ? <Fact label="Road" value={s.roadTestRoadCondition} /> : null}
          {s.roadTestInitialSymptom ? (
            <Fact label="Symptom before" value={s.roadTestInitialSymptom} />
          ) : null}
          {s.roadTestNotes ? <Fact label="Notes" value={s.roadTestNotes} /> : null}
        </dl>
      ) : (
        <p style={{ margin: 0, color: themeVar.textSecondary }}>No road test was carried out.</p>
      )}
    </>
  );
}

function describe(s: Session): string {
  if (s.status === 'submitted') {
    return 'Submitted for quality control. The results are frozen — an inspection that could be edited by the person who did the work would not be independent (§563).';
  }
  return s.editable
    ? 'Record each test with what you expected and what you got. A failed test is a result too — quality control decides what to do about it.'
    : 'This session is being recorded. Your role can read it but not change it.';
}

const sectionHeading = {
  fontSize: primitive.fontSize.base,
  color: themeVar.textPrimary,
  margin: `${primitive.space[4]} 0 ${primitive.space[2]} 0`,
};

const record = {
  padding: primitive.space[3],
  border: `1px solid ${themeVar.borderDefault}`,
  borderRadius: primitive.radius.md,
  background: themeVar.surfaceRaised,
  // Positioned containing block, for the reason every container in these slices has one.
  position: 'relative' as const,
};

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt style={{ color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: themeVar.textPrimary,
          fontFamily: mono ? primitive.fontFamily.mono : 'inherit',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
