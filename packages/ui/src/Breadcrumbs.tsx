'use client';

import * as React from 'react';
import { themeVar, primitive } from '@autoworkshop/design-tokens';
import type { Crumb } from '@autoworkshop/navigation';

/**
 * Breadcrumb trail — `autoworkshop 01 (1).txt` §2, "Page Header and
 * Breadcrumbs".
 *
 * `<nav aria-label="Breadcrumb">` wrapping an ordered list is the WAI-ARIA
 * pattern; the ordering is meaningful, so `<ol>` rather than `<ul>`.
 * `aria-current="page"` marks the final crumb, which is why it is rendered as
 * text and not as a link to the page you are already on.
 */

export interface BreadcrumbsProps {
  crumbs: Crumb[];
  renderLink: (props: { href: string; children: React.ReactNode }) => React.ReactNode;
}

export function Breadcrumbs({ crumbs, renderLink }: BreadcrumbsProps) {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: primitive.space[2],
          listStyle: 'none',
          margin: 0,
          padding: 0,
          fontSize: primitive.fontSize.sm,
          color: themeVar.textSecondary,
        }}
      >
        {crumbs.map((c, idx) => {
          const last = idx === crumbs.length - 1;
          return (
            <li key={`${c.label}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: primitive.space[2] }}>
              {idx > 0 && (
                <span aria-hidden="true" style={{ color: themeVar.borderDefault }}>
                  ›
                </span>
              )}
              {last || !c.href ? (
                <span aria-current={last ? 'page' : undefined} style={{ color: last ? themeVar.textPrimary : undefined }}>
                  {c.label}
                </span>
              ) : (
                renderLink({ href: c.href, children: c.label })
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
