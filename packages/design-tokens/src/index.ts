/**
 * AutoWorkshop AI design tokens.
 *
 * Hierarchy per `autoworkshop 01 (1).txt` §64:
 *   primitive -> semantic -> component
 *
 * Generated from the Penpot design system (ADR-007 — Penpot, not Figma:
 * Figma Dev Mode and Chromatic are paid at team scale, and `05.txt` §1
 * mandates zero-cost open-source tooling).
 */

/** Primitive tokens — raw values. Never referenced directly by components. */
export const primitive = {
  color: {
    blue:   { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
    green:  { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
    amber:  { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
    red:    { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
    grey:   { 0: '#ffffff', 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
              400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
              800: '#1f2937', 900: '#111827' },
  },
  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
           6: '1.5rem', 8: '2rem', 12: '3rem', 16: '4rem' },
  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem', full: '9999px' },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
              xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
} as const;

/** Semantic tokens — purpose, not appearance. Components use these. */
export const semantic = {
  backgroundPrimary:   primitive.color.grey[0],
  backgroundSecondary: primitive.color.grey[50],
  surfaceRaised:       primitive.color.grey[0],
  textPrimary:         primitive.color.grey[900],
  textSecondary:       primitive.color.grey[600],
  borderDefault:       primitive.color.grey[200],
  actionPrimary:       primitive.color.blue[600],
  actionSecondary:     primitive.color.grey[100],
  statusSuccess:       primitive.color.green[600],
  statusWarning:       primitive.color.amber[600],
  statusDanger:        primitive.color.red[600],
  statusInformation:   primitive.color.blue[600],
} as const;

/**
 * Automotive status colours (`01 (1).txt` §66).
 *
 * HARD RULE: colour is never the only status signal. Every status must also
 * carry text, an icon and a label — enforced by the StatusBadge component,
 * which requires a `label` prop.
 */
export const statusColor = {
  draft:     primitive.color.grey[500],   // draft, disabled, archived, unavailable
  active:    primitive.color.blue[600],   // normal action, active navigation
  complete:  primitive.color.green[600],  // completed, verified, paid, passed
  attention: primitive.color.amber[600],  // attention required, pending, conditional
  blocked:   primitive.color.red[600],    // failed, blocked, unsafe, overdue, critical
} as const;

export type StatusKind = keyof typeof statusColor;

/** Responsive breakpoints (`01 (1).txt` §68): 12-col desktop / 8 tablet / 4 mobile. */
export const breakpoint = {
  mobile: '360px', mobileLarge: '480px', tabletPortrait: '768px',
  tabletLandscape: '1024px', laptop: '1280px', desktop: '1536px', desktopLarge: '1920px',
} as const;
