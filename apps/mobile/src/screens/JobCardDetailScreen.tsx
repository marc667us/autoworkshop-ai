import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { apiGet, apiPatch, describeFailure, type ApiFailure } from '../api/client';
import { humanStage, stageAvailability, type JobCardDetail } from './stage-display';

/**
 * One job card, and the one thing a technician does to it on a phone: move it
 * to its next stage.
 *
 * ⚠️ THE OPTIONS COME FROM THE SERVER, AND ARE STILL NOT A CONTROL.
 * `allowedStages` is the lifecycle narrowed to the moves THIS viewer may make on
 * THIS card, so the screen offers only buttons that should succeed. That is a
 * convenience. `changeStage` re-derives the entire judgement server-side on
 * every call — the job-card service says so in as many words — so a phone that
 * sent a stage it was never offered is refused exactly as a browser would be.
 * This screen therefore never hides a refusal: it shows the server's reason.
 *
 * ⚠️ NO OPTIMISTIC UPDATE. The stage shown is always the stage the server last
 * confirmed. Painting the new stage immediately and rolling back on failure
 * would, on a workshop connection, routinely show a technician a move that did
 * not happen — and the whole value of the staging board is that it is true.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; card: JobCardDetail }
  | { kind: 'failed'; reason: ApiFailure };

export function JobCardDetailScreen({
  jobCardId,
  onBack,
}: {
  jobCardId: string;
  onBack: () => void;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // ⚠️ A REF, NOT THE `moving` STATE, GUARDS THE SECOND TAP. Raised by Codex:
  // `disabled={moving !== null}` only takes effect after React re-renders, and
  // two fast taps both enter `moveTo` before that — sending two PATCHes whose
  // replies can then arrive out of order, so the user sees a refusal for a move
  // that actually succeeded. A ref updates synchronously, so the second tap
  // never starts.
  const movingRef = useRef(false);

  // Async work outsurvives this screen: a technician can back out mid-request.
  // Writing state afterwards is at best wasted and at worst re-renders a screen
  // that is gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const result = await apiGet<JobCardDetail>(`/api/v1/job-cards/${jobCardId}`);
    if (!mounted.current) return;
    setState(
      result.ok ? { kind: 'ready', card: result.data } : { kind: 'failed', reason: result.reason },
    );
  }, [jobCardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (mounted.current) setRefreshing(false);
  }, [load]);

  const moveTo = useCallback(
    async (toStage: string, label: string) => {
      if (movingRef.current) return;
      movingRef.current = true;
      setMoving(toStage);
      setNotice(null);

      const result = await apiPatch<unknown>(`/api/v1/job-cards/${jobCardId}/stage`, { toStage });
      movingRef.current = false;
      if (!mounted.current) return;
      setMoving(null);

      if (!result.ok) {
        const { detail } = describeFailure(result.reason);
        setNotice({ tone: 'bad', text: detail });
        return;
      }
      // 🔴 RE-READ RATHER THAN TRUST THE RESPONSE. "Saved" is a claim; the
      // stage the next person sees is whatever the database holds. The web
      // pricing screen learned this the same way.
      await load();
      if (mounted.current) setNotice({ tone: 'ok', text: `Moved to ${label}.` });
    },
    [jobCardId, load],
  );

  if (state.kind === 'loading') {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
        <Text style={styles.muted}>Opening the job card…</Text>
      </View>
    );
  }

  if (state.kind === 'failed') {
    const { title, detail } = describeFailure(state.reason);
    return (
      <View style={styles.centre}>
        <Text style={styles.failTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
        <Pressable style={styles.button} onPress={() => void load()} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={onBack} accessibilityRole="button">
          <Text style={styles.link}>Back to job cards</Text>
        </Pressable>
      </View>
    );
  }

  const card = state.card;
  const availability = stageAvailability(card);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Pressable
        style={styles.linkButton}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to job cards"
      >
        <Text style={styles.link}>‹ Job cards</Text>
      </Pressable>

      <Text style={styles.jobNumber}>{card.jobNumber}</Text>
      <Text style={styles.stage}>{humanStage(card.stage)}</Text>

      {notice ? (
        <View style={[styles.notice, notice.tone === 'bad' ? styles.noticeBad : styles.noticeOk]}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Field label="Vehicle" value={`${card.registrationNumber} — ${card.vehicleDescription}`} />
      <Field label="Customer" value={card.customerName} />
      <Field label="Complaint" value={card.complaint} />
      <Field label="Priority" value={card.priority} />
      <Field label="Assigned to" value={card.assignedTechnicianName ?? 'Nobody yet'} />
      <Field label="Mileage at intake" value={card.mileageAtIntake?.toLocaleString() ?? 'Not recorded'} />
      <Field label="Expected completion" value={card.expectedCompletionOn ?? 'Not set'} />

      <Text style={styles.sectionTitle}>Move this job on</Text>
      {availability.kind === 'options' ? (
        availability.options.map((option) => (
          <Pressable
            key={option.value}
            style={[styles.button, moving ? styles.buttonBusy : null]}
            disabled={moving !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: moving !== null }}
            accessibilityLabel={`Move this job to ${option.label}`}
            onPress={() => void moveTo(option.value, option.label)}
          >
            <Text style={styles.buttonText}>
              {moving === option.value ? 'Moving…' : option.label}
            </Text>
          </Pressable>
        ))
      ) : (
        // ⚠️ AN EXPLANATION, NOT AN EMPTY SPACE — and the RIGHT explanation.
        // `05.txt` requires every refusal to name a reachable alternative, and
        // these three reasons have three different alternatives. The last one
        // is deliberately about the APP, not the user: see `stageAvailability`.
        <Text style={styles.muted}>
          {availability.kind === 'closed'
            ? 'This job is closed, so it has no next stage.'
            : availability.kind === 'noMoves'
              ? 'There is no move available to you from this stage. A workshop manager can move it on.'
              : 'The available moves could not be read from the workshop system. Pull down to refresh; if it keeps happening the app needs updating.'}
        </Text>
      )}
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 48 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  jobNumber: { fontSize: 26, fontWeight: '700', marginTop: 4 },
  stage: { fontSize: 15, color: '#4a5568', marginBottom: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginTop: 26, marginBottom: 10 },
  field: { paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d8dde4' },
  fieldLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 16, marginTop: 3 },
  button: {
    backgroundColor: '#1f4b99',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { paddingVertical: 10 },
  link: { color: '#1f4b99', fontSize: 16 },
  failTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  muted: { color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  notice: { padding: 12, borderRadius: 8, marginBottom: 12 },
  noticeOk: { backgroundColor: '#e6f4ea' },
  noticeBad: { backgroundColor: '#fdecea' },
  noticeText: { fontSize: 14, lineHeight: 19 },
});
