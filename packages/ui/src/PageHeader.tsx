'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';

/**
 * Page header and the three mandatory content states.
 *
 * CLAUDE.md "Required per module" lists loading states, empty states and error
 * states alongside the page itself. Shipping them as components means a new
 * screen gets them by default instead of each author reinventing a spinner —
 * and it makes "does this page handle empty?" reviewable at a glance.
 */

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: primitive.space[4],
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1 style={{ fontSize: primitive.fontSize['2xl'], margin: 0, color: themeVar.textPrimary }}>{title}</h1>
        {description ? (
          <p style={{ margin: `${primitive.space[1]} 0 0`, color: themeVar.textSecondary, fontSize: primitive.fontSize.sm }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: primitive.space[2] }}>{actions}</div> : null}
    </div>
  );
}

function Panel({ children, tone }: { children: React.ReactNode; tone?: 'danger' }) {
  return (
    <div
      style={{
        border: `1px solid ${tone === 'danger' ? themeVar.statusDanger : themeVar.borderDefault}`,
        borderRadius: primitive.radius.lg,
        padding: primitive.space[8],
        background: themeVar.surfaceRaised,
        textAlign: 'center',
        color: themeVar.textSecondary,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Loading state.
 *
 * `role="status"` + `aria-live="polite"` so a screen reader announces the wait
 * instead of landing on a silent, apparently-empty page.
 */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <Panel>
      <div role="status" aria-live="polite">
        {label}
      </div>
    </Panel>
  );
}

/**
 * Empty state.
 *
 * Takes an explicit `action` because "there is nothing here" without a way
 * forward is a dead end — the most common place a user gives up.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Panel>
      <p style={{ margin: 0, color: themeVar.textPrimary, fontWeight: 600 }}>{title}</p>
      {description ? <p style={{ margin: `${primitive.space[2]} 0 0` }}>{description}</p> : null}
      {action ? <div style={{ marginTop: primitive.space[4] }}>{action}</div> : null}
    </Panel>
  );
}

/**
 * Error state.
 *
 * `role="alert"` because an error that fails silently for assistive tech is a
 * bug, not a style choice. Per CLAUDE.md §15 the caller passes a SAFE message —
 * raw exception text must never reach here.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
}: {
  title?: string;
  message: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <Panel tone="danger">
      <p role="alert" style={{ margin: 0, color: themeVar.statusDanger, fontWeight: 600 }}>
        {title}
      </p>
      <p style={{ margin: `${primitive.space[2]} 0 0` }}>{message}</p>
      {requestId ? (
        <p style={{ margin: `${primitive.space[2]} 0 0`, fontSize: primitive.fontSize.xs }}>
          Reference: <code>{requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: primitive.space[4],
            padding: `${primitive.space[2]} ${primitive.space[4]}`,
            border: 'none',
            borderRadius: primitive.radius.md,
            background: themeVar.actionPrimary,
            color: primitive.color.grey[0],
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      ) : null}
    </Panel>
  );
}
