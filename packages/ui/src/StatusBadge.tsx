import * as React from 'react';
import { statusVar, type StatusKind } from '@autoworkshop/design-tokens';

export interface StatusBadgeProps {
  kind: StatusKind;
  /**
   * Required, not optional, and deliberately so.
   *
   * `autoworkshop 01 (1).txt` §66: "Colour shall never be the only method used
   * to communicate status. Every status shall also use text, icon, badge,
   * label." Making `label` mandatory means the type system enforces the
   * accessibility rule — a colour-only badge will not compile.
   */
  label: string;
  icon?: React.ReactNode;
}

export function StatusBadge({ kind, label, icon }: StatusBadgeProps) {
  return (
    <span
      role="status"
      data-status={kind}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        padding: '0.125rem 0.5rem', borderRadius: '9999px',
        fontSize: '0.875rem', lineHeight: 1.5,
        color: statusVar[kind], border: `1px solid ${statusVar[kind]}`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}
