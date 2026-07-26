import { primitive } from './primitive';

export { primitive };

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

/**
 * Selectable themes (light / dark) as CSS custom properties.
 *
 * `semantic` above stays as the build-time palette for contexts where CSS
 * variables do not resolve (email, PDF, canvas). Anything rendered in the
 * browser should use `themeVar`, which is shape-identical but resolves at
 * runtime so the user's theme choice actually applies.
 */
export {
  themes,
  themeVar,
  statusVar,
  lightTheme,
  darkTheme,
  themeToCss,
  themeStylesheet,
  cssVarName,
} from './themes';
export type { ThemeName, ThemePalette } from './themes';
