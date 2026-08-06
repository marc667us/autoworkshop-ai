import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';
import { themeVar } from '@autoworkshop/design-tokens';

/**
 * TRAINING MATERIALS — slice 16. One screen, three routes:
 * `/learning/technical-videos`, `/learning/audio-guides`, `/learning/assessments`.
 *
 * ── 🔴 THE PLATFORM RECORDS TRAINING; IT DOES NOT HOST IT ─────────────────
 *
 * This was the decision that kept these three as signposts, and it is made
 * explicitly in migration 057. There were two readings:
 *
 *   HOST the media — object storage per course, uploads, a player, transcoding,
 *   and a licence position on content the workshop did not create. A module,
 *   and a bill that arrives later and cannot be undone (ADR-012).
 *
 *   RECORD training that happens elsewhere — the workshop already has its
 *   videos on a drive and its assessments from a trade body. It needs a LINK, a
 *   kind, and who has completed what.
 *
 * The second is what this is, and `learning.courses` was already modelling it
 * (provider, duration, grants_certification) before any of this was built.
 *
 * ⚠️ SO THE SCREEN SAYS SO, IN THE DESCRIPTION, WHERE IT WILL BE READ. A page
 * listing links while implying the video lives here would be a promise the
 * product cannot keep — and the honest version costs one sentence.
 *
 * ⚠️ THE COMPLETION SHOWN IS THE VIEWER'S OWN. A technician opening
 * Assessments wants to know what THEY still owe; showing every colleague's
 * record would answer a manager's question on a technician's screen.
 */

interface MaterialRow {
  id: string;
  materialKind: string;
  title: string;
  description: string | null;
  externalUrl: string | null;
  durationMinutes: number | null;
  courseTitle: string | null;
  provider: string | null;
  completedOn: string | null;
  scorePercent: number | null;
}

const COPY: Record<string, { title: string; description: string; empty: string }> = {
  video: {
    title: 'Technical Videos',
    description:
      'Training videos your workshop has collected. The platform keeps the link and your completion record — the video itself lives wherever the workshop or supplier hosts it.',
    empty:
      'No videos have been added. A manager can add one against a course with the link the workshop already uses.',
  },
  audio: {
    title: 'Audio Guides',
    description:
      'Audio training your workshop has collected. The platform keeps the link and your completion record; the audio lives wherever it is published.',
    empty: 'No audio guides have been added yet.',
  },
  assessment: {
    title: 'Assessments',
    description:
      'Assessments you are expected to complete, and the ones you have. An assessment may be sat on paper, in person, or with a trade body — this is the record of it, and your score where there is one.',
    empty:
      'No assessments have been set. Certifications you already hold are on the certifications page.',
  },
};

export async function LearningMaterialsScreen({ kind }: { kind: 'video' | 'audio' | 'assessment' }) {
  const materials = await apiGet<MaterialRow[]>('workshop', `/learning/materials?kind=${kind}`);
  const copy = COPY[kind]!;

  const header = <PageHeader title={copy.title} description={copy.description} />;

  if (!materials.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={materials.reason} workspaceId="workshop" />
      </>
    );
  }

  if (materials.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="Nothing here yet" description={copy.empty} />
      </>
    );
  }

  const done = materials.data.filter((m) => m.completedOn !== null).length;
  const outstanding = materials.data.length - done;

  return (
    <>
      {header}
      <DataTable
        caption={
          outstanding === 0
            ? `${materials.data.length} items · you have completed all of them`
            : `${materials.data.length} items · ${outstanding} you have not completed`
        }
        rows={materials.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Title', cell: (r) => r.title },
          { key: 'course', header: 'Course', cell: (r) => r.courseTitle ?? '—' },
          { key: 'provider', header: 'Provider', cell: (r) => r.provider ?? '—' },
          {
            key: 'mins',
            header: 'Length',
            numeric: true,
            nowrap: true,
            cell: (r) => (r.durationMinutes === null ? '—' : `${r.durationMinutes} min`),
          },
          {
            key: 'link',
            header: 'Open',
            nowrap: true,
            cell: (r) =>
              r.externalUrl ? (
                // `rel` set because this leaves the product — the destination is
                // the workshop's own drive or a supplier's site, not ours.
                <a href={r.externalUrl} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
              ) : (
                <span style={{ color: themeVar.textSecondary }}>no link</span>
              ),
          },
          {
            key: 'state',
            header: 'You',
            cell: (r) =>
              r.completedOn === null ? (
                <StatusBadge kind="attention" label="Not done" />
              ) : r.scorePercent === null ? (
                <StatusBadge kind="complete" label={`Done ${r.completedOn}`} />
              ) : (
                <StatusBadge kind="complete" label={`${r.scorePercent}% · ${r.completedOn}`} />
              ),
          },
        ]}
      />
    </>
  );
}
