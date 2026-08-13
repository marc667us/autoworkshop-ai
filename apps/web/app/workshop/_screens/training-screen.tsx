import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import {
  DataTable,
  EmptyState,
  Field,
  FormShell,
  PageHeader,
  StatusBadge,
  SubmitButton,
  TextInput,
} from '@autoworkshop/ui';
import { navLabelFor } from './nav-label';
import { createCourseAction } from './knowledge-actions';

/**
 * TRAINING — slice 10.
 *
 * ⚠️ THIS IS A REGISTER OF COURSES, NOT A COURSE PLAYER. The platform does not
 * host training material and does not pretend to: a workshop records what
 * training exists, who provides it and what it grants, and the certifications
 * screen records who has done it. Building a video player here would have been
 * a large feature nobody asked for, and shipping an empty one would be the
 * "disconnected mock page" `05.txt` §2 forbids.
 *
 * ⚠️ `holders` IS COUNTED FROM `learning.certifications`, so this screen and the
 * certifications screen cannot disagree about who has done what.
 */

interface Course {
  id: string;
  title: string;
  description: string | null;
  provider: string | null;
  durationMinutes: number | null;
  grantsCertification: string | null;
  isActive: boolean;
  holders: number;
}

function duration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export async function TrainingScreen({ route }: { route: string }) {
  const title = await navLabelFor('workshop', route, 'Training');
  const courses = await apiGet<Course[]>('workshop', '/knowledge/courses');

  const header = (
    <PageHeader
      title={title}
      description="The training this workshop recognises — what it is, who provides it, and what holding it grants."
    />
  );

  if (!courses.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={courses.reason} workspaceId="workshop" />
      </>
    );
  }

  const form = (
    <FormShell action={createCourseAction} successPrefix="Saved">
      <Field label="Course" htmlFor="title">
        <TextInput id="title" name="title" required maxLength={300} />
      </Field>
      <Field label="Provider" htmlFor="provider" hint="Who runs it.">
        <TextInput id="provider" name="provider" maxLength={200} />
      </Field>
      <Field label="Description" htmlFor="description">
        <TextInput id="description" name="description" maxLength={5000} />
      </Field>
      <Field label="Duration (minutes)" htmlFor="durationMinutes">
        <TextInput id="durationMinutes" name="durationMinutes" type="number" min={1} step={1} />
      </Field>
      <Field
        label="Certification it grants"
        htmlFor="grantsCertification"
        hint="Record who has actually earned it on the Certifications page."
      >
        <TextInput id="grantsCertification" name="grantsCertification" maxLength={200} />
      </Field>
      <SubmitButton>Add course</SubmitButton>
    </FormShell>
  );

  if (courses.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No training is recorded"
          description="Recording the courses this workshop recognises is what lets a certification mean something specific rather than being a free-text note."
        />
        {form}
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${courses.data.length} courses`}
        rows={courses.data}
        rowKey={(r) => r.id}
        columns={[
          { key: 'title', header: 'Course', cell: (r) => r.title },
          { key: 'provider', header: 'Provider', cell: (r) => r.provider ?? '—' },
          { key: 'desc', header: 'What it covers', cell: (r) => r.description ?? '—' },
          { key: 'time', header: 'Duration', numeric: true, nowrap: true, cell: (r) => duration(r.durationMinutes) },
          { key: 'grants', header: 'Grants', cell: (r) => r.grantsCertification ?? '—' },
          {
            key: 'holders',
            header: 'People holding it',
            numeric: true,
            nowrap: true,
            cell: (r) =>
              r.holders > 0 ? (
                <StatusBadge kind="complete" label={String(r.holders)} />
              ) : (
                <StatusBadge kind="draft" label="nobody yet" />
              ),
          },
        ]}
      />
      <p style={{ margin: '0.75rem 0 0', maxWidth: '60ch' }}>
        This is a register, not a course player — the platform does not host the
        training itself. Record who has completed a course on the{' '}
        Certifications page, and the count above follows from it.
      </p>
      {form}
    </>
  );
}
