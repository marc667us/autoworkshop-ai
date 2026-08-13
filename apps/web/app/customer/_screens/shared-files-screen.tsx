import { ApiFailure, apiGet } from '@autoworkshop/next-shell';
import { DataTable, EmptyState, PageHeader, StatusBadge } from '@autoworkshop/ui';

/**
 * SHARED FILES — the customer's side of slice 7.
 *
 * ⚠️ NO NEW MECHANISM, AND NO NEW TABLE. Files reach a customer as ATTACHMENTS
 * to messages: `media.links` has carried a `message` owner type since migration
 * 040, and creating `comms.messages` in 046 is what switched that path on. This
 * screen is a different VIEW of the same rows — every attachment across every
 * conversation this customer is part of, most recent first.
 *
 * Building a separate "shared files" store would have produced two places a
 * file could live and no rule for which one a customer should look in.
 *
 * ⚠️ IT SHOWS WHAT WAS SHARED, NOT EVERY FILE ABOUT THE VEHICLE. Inspection
 * photographs the workshop has not sent are not here, deliberately: this is the
 * record of what was shared WITH the customer, and implying otherwise would
 * suggest they had seen evidence nobody sent them.
 */

interface SharedFile {
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  sharedAt: string;
  threadSubject: string;
  senderName: string;
  jobNumber: string | null;
}

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function size(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function SharedFilesScreen({ route }: { route: string }) {
  const files = await apiGet<SharedFile[]>('customer', '/comms/shared-files');

  const header = (
    <PageHeader
      title="Shared Files"
      description="Everything the workshop has sent you, and everything you have sent them, gathered from your conversations."
    />
  );

  if (!files.ok) {
    return (
      <>
        {header}
        <ApiFailure reason={files.reason} workspaceId="customer" />
      </>
    );
  }

  if (files.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No files have been shared"
          description="Photographs, reports and documents attached to a message appear here. Nothing has been attached to any of your conversations yet."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <DataTable
        caption={`${files.data.length} files shared`}
        rows={files.data}
        rowKey={(r) => r.assetId}
        columns={[
          { key: 'name', header: 'File', cell: (r) => r.fileName },
          { key: 'about', header: 'Conversation', cell: (r) => r.threadSubject },
          { key: 'job', header: 'Repair', nowrap: true, cell: (r) => r.jobNumber ?? '—' },
          { key: 'from', header: 'Sent by', cell: (r) => r.senderName },
          { key: 'size', header: 'Size', numeric: true, nowrap: true, cell: (r) => size(r.sizeBytes) },
          { key: 'at', header: 'Shared', nowrap: true, cell: (r) => when(r.sharedAt) },
          {
            key: 'kind',
            header: 'Type',
            cell: (r) => (
              <StatusBadge
                kind="active"
                label={r.contentType.startsWith('image/') ? 'Photograph' : 'Document'}
              />
            ),
          },
        ]}
      />
    </>
  );
}
