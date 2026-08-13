'use client';

import { useCallback, useId, useRef, useState, useTransition } from 'react';
import { themeVar } from '@autoworkshop/design-tokens';
import { StatusBadge, visuallyHidden } from '@autoworkshop/ui';
import {
  confirmUpload,
  detachEvidence,
  requestUploadUrl,
  type EvidenceAsset,
} from './evidence-actions';

/**
 * THE EVIDENCE PANEL — attach photographs, video, voice notes and documents to
 * a record. Slice 1 of `COMPLETION_PLAN.md`.
 *
 * ── 🔴 WHY THE BROWSER UPLOADS AND NOT THE SERVER ──────────────────────────
 *
 * The file NEVER passes through the API. This component asks for a presigned
 * PUT, then `fetch`es MinIO directly. `StorageService`'s header gives the three
 * reasons — a phone photo would tie up an API worker for the whole upload on a
 * workshop's connection, the API has no business holding customers' vehicle
 * photographs in memory, and Render's free tier has a body limit a video
 * exceeds. The signature carries the authorisation, and it expires.
 *
 * ── ⚠️ THE THREE STEPS ARE NOT AN IMPLEMENTATION DETAIL ────────────────────
 *
 * mint -> PUT -> confirm. The confirm exists because the URL is minted BEFORE
 * the upload and the person may close the tab or lose signal halfway. Without
 * it every gallery would show broken images and nobody could tell a failed
 * upload from a deleted file. So the asset only becomes visible after the PUT
 * actually returned 2xx — and if it did not, the row stays `pending` and is
 * never rendered.
 *
 * ── ⚠️ IT SAYS THAT NOTHING SCANNED THE FILE ───────────────────────────────
 *
 * `scanStatus` is `skipped`, honestly, because there is no virus scanner in the
 * compose file and ADR-012 forbids buying one. A badge saying "not scanned" is
 * the truth; a green tick would be the "comment claiming a guard that does not
 * exist" defect this repository has recorded three times. The person deciding
 * whether to open a stranger's PDF is entitled to know.
 */

export interface EvidencePanelProps {
  ownerType: string;
  ownerId: string;
  assets: EvidenceAsset[];
  /** Path to revalidate after a change, so the server component re-renders. */
  revalidate?: string;
  /** When false the panel is read-only — it still SHOWS what is attached. */
  canAttach?: boolean;
  heading?: string;
  description?: string;
}

const MAX_BYTES = 64 * 1024 * 1024;

function humanSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindOf(contentType: string): 'image' | 'video' | 'audio' | 'document' {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'document';
}

export function EvidencePanel({
  ownerType,
  ownerId,
  assets,
  revalidate,
  canAttach = true,
  heading = 'Photographs and documents',
  description,
}: EvidencePanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const upload = useCallback(
    async (file: File) => {
      setError(null);

      // Refused HERE as well as by the API, so a person on a workshop
      // connection is told before they spend four minutes uploading. The API
      // refuses it too — this is a courtesy, never the control.
      if (file.size > MAX_BYTES) {
        setError(
          `${file.name} is ${humanSize(file.size)}. The limit is 64 MB — ` +
            'record a shorter clip, or attach the document instead of the video.',
        );
        return;
      }

      setBusy(`Uploading ${file.name}…`);
      const minted = await requestUploadUrl({
        ownerType,
        ownerId,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
      });
      if (!minted.ok) {
        setBusy(null);
        setError(minted.error);
        return;
      }

      let put: Response;
      try {
        put = await fetch(minted.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
      } catch {
        setBusy(null);
        // ⚠️ NAMES THE STAGE THAT FAILED. "Upload failed" would send someone to
        // check their login when the actual problem is that object storage is
        // unreachable. The asset row stays `pending` and shows nowhere, so the
        // product is in a consistent state — say so.
        setError(
          `${file.name} did not reach storage. Nothing was attached — check the ` +
            'connection and try again.',
        );
        return;
      }

      if (!put.ok) {
        setBusy(null);
        setError(
          `Storage refused ${file.name} (${put.status}). Nothing was attached.`,
        );
        return;
      }

      const confirmed = await confirmUpload(minted.assetId, file.size, revalidate);
      setBusy(null);
      if (!confirmed.ok) {
        // The file IS in storage but the product does not know it. Say exactly
        // that rather than "failed", because retrying will work and deleting
        // will not.
        setError(
          `${file.name} uploaded but could not be recorded: ${confirmed.error} Try attaching it again.`,
        );
        return;
      }
      startTransition(() => {
        if (inputRef.current) inputRef.current.value = '';
      });
    },
    [ownerType, ownerId, revalidate],
  );

  const stored = assets.filter((a) => a.status === 'stored');

  return (
    <section
      style={{
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: '0.75rem',
        padding: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{heading}</h2>
        {description ? (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', opacity: 0.8 }}>
            {description}
          </p>
        ) : null}
      </div>

      {canAttach ? (
        <div>
          <label htmlFor={inputId} style={visuallyHidden}>
            Choose a file to attach
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/mp4,audio/webm,audio/ogg,application/pdf"
            disabled={busy !== null}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
            style={{ fontFamily: 'inherit', fontSize: '0.875rem' }}
          />
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', opacity: 0.7 }}>
            Photographs, video, voice notes or PDF. Up to 64 MB.{' '}
            {/* Honest, and deliberately not hidden in a tooltip. */}
            Files are stored as uploaded and are <strong>not virus-scanned</strong>.
          </p>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.8125rem', opacity: 0.75 }}>
          Your role can see what is attached here but cannot add to it.
        </p>
      )}

      {busy ? (
        <p role="status" style={{ margin: 0, fontSize: '0.875rem' }}>
          {busy}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: themeVar.statusDanger,
          }}
        >
          {error}
        </p>
      ) : null}

      {stored.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.75 }}>
          Nothing attached yet.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))',
            gap: '0.75rem',
          }}
        >
          {stored.map((asset) => (
            <li
              key={asset.id}
              style={{
                border: `1px solid ${themeVar.borderDefault}`,
                borderRadius: '0.5rem',
                padding: '0.5rem',
                display: 'grid',
                gap: '0.375rem',
              }}
            >
              {kindOf(asset.contentType) === 'image' && asset.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.url}
                  alt={asset.caption ?? asset.originalName ?? 'Attached photograph'}
                  style={{
                    width: '100%',
                    height: '8rem',
                    objectFit: 'cover',
                    borderRadius: '0.375rem',
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    height: '8rem',
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '0.375rem',
                    background: 'rgba(127,127,127,0.12)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {kindOf(asset.contentType)}
                </div>
              )}

              <span style={{ fontSize: '0.8125rem', wordBreak: 'break-word' }}>
                {asset.originalName ?? 'Attachment'}
              </span>
              <span style={{ fontSize: '0.6875rem', opacity: 0.7 }}>
                {humanSize(asset.byteSize)}
                {asset.uploadedByName ? ` · ${asset.uploadedByName}` : ''}
              </span>

              {asset.scanStatus === 'skipped' ? (
                <StatusBadge kind="draft" label="Not scanned" />
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {asset.url ? (
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ fontSize: '0.75rem' }}
                  >
                    Open
                  </a>
                ) : null}
                {canAttach ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      setError(null);
                      setBusy('Detaching…');
                      const result = await detachEvidence(
                        asset.id,
                        ownerType,
                        ownerId,
                        revalidate,
                      );
                      setBusy(null);
                      if (!result.ok) setError(result.error);
                    }}
                    style={{
                      fontFamily: 'inherit',
                      fontSize: '0.75rem',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      color: 'inherit',
                    }}
                  >
                    Detach
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
