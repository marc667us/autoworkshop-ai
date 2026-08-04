/**
 * Selectable themes.
 *
 * WHY CSS CUSTOM PROPERTIES RATHER THAN JS CONSTANTS. The `semantic` object in
 * `index.ts` is resolved at build time, so a component reading `semantic.textPrimary`
 * is frozen to one palette. Switching themes at runtime would need every styled
 * component to re-render from a context — hundreds of re-renders for a colour
 * change, and any component that forgot to subscribe would silently keep the old
 * theme. CSS variables move the switch to the browser: set one attribute on
 * `<html>` and every colour updates at once, including inside portals and
 * pseudo-elements that a React context cannot reach.
 *
 * `themeVar` below therefore mirrors the `semantic` keys, but each value is a
 * `var(--aw-*)` reference. Components use `themeVar`; `semantic` stays for
 * non-themed contexts (emails, PDFs, canvas) where CSS variables do not resolve.
 *
 * §66's rule still holds in every theme: colour is never the only status signal,
 * so each theme keeps status hues distinguishable AND components keep their text
 * labels.
 */

import { primitive } from './primitive';

export type ThemeName = 'light' | 'dark';

/** The semantic keys a theme must define. Keeps themes from drifting apart. */
export interface ThemePalette {
  backgroundPrimary: string;
  backgroundSecondary: string;
  surfaceRaised: string;
  textPrimary: string;
  textSecondary: string;
  borderDefault: string;
  actionPrimary: string;
  actionPrimarySoft: string;
  actionSecondary: string;
  statusSuccess: string;
  statusWarning: string;
  statusDanger: string;
  statusInformation: string;
  /**
   * The five automotive status kinds of §66. They live in the THEME, not only
   * in `statusColor`, because the 600/700-level hues that read well on a light
   * surface lose contrast against a dark one. §66's rule is unchanged: colour
   * is never the only signal, and StatusBadge still requires a text label.
   */
  statusDraft: string;
  statusActive: string;
  statusComplete: string;
  statusAttention: string;
  statusBlocked: string;
}

/**
 * Light theme — deliberately NOT paper-white.
 *
 * The owner asked for "a little darker" on 2026-07-26. A workshop floor is a
 * bright environment and technicians read this on tablets for whole shifts, so
 * the page sits on grey-100 with cards on grey-50 rather than #ffffff on #ffffff.
 * That lowers glare and, usefully, makes raised surfaces legible by tone instead
 * of relying on a border.
 */
export const lightTheme: ThemePalette = {
  backgroundPrimary: primitive.color.grey[100],
  backgroundSecondary: primitive.color.grey[200],
  surfaceRaised: primitive.color.grey[50],
  textPrimary: primitive.color.grey[900],
  textSecondary: primitive.color.grey[600],
  borderDefault: primitive.color.grey[300],
  actionPrimary: primitive.color.blue[700],
  actionPrimarySoft: primitive.color.blue[100],
  actionSecondary: primitive.color.grey[200],
  statusSuccess: primitive.color.green[700],
  statusWarning: primitive.color.amber[700],
  statusDanger: primitive.color.red[700],
  statusInformation: primitive.color.blue[700],
  statusDraft: primitive.color.grey[600],
  statusActive: primitive.color.blue[700],
  statusComplete: primitive.color.green[700],
  statusAttention: primitive.color.amber[700],
  statusBlocked: primitive.color.red[700],
};

/**
 * Dark theme.
 *
 * Surfaces get LIGHTER with elevation (900 page -> 800 raised), which is how a
 * dark UI conveys depth — a dark theme that darkens raised surfaces reads as
 * inverted and flat. Text is grey-100 rather than pure white: #fff on a dark
 * background haloes badly on LCD panels during long reading.
 *
 * Status and action colours step DOWN to the 500 range. The 700s chosen for
 * light are too dense against a dark surface to clear WCAG contrast.
 */
export const darkTheme: ThemePalette = {
  backgroundPrimary: primitive.color.grey[900],
  backgroundSecondary: primitive.color.grey[800],
  surfaceRaised: primitive.color.grey[800],
  textPrimary: primitive.color.grey[100],
  textSecondary: primitive.color.grey[400],
  borderDefault: primitive.color.grey[700],
  actionPrimary: primitive.color.blue[500],
  actionPrimarySoft: primitive.color.grey[700],
  actionSecondary: primitive.color.grey[700],
  statusSuccess: primitive.color.green[500],
  statusWarning: primitive.color.amber[500],
  statusDanger: primitive.color.red[500],
  statusInformation: primitive.color.blue[500],
  statusDraft: primitive.color.grey[400],
  statusActive: primitive.color.blue[500],
  statusComplete: primitive.color.green[500],
  statusAttention: primitive.color.amber[500],
  statusBlocked: primitive.color.red[500],
};

/**
 * Map a §66 status kind to its themed CSS variable.
 *
 * Lets StatusBadge stay driven by `StatusKind` while following the active
 * theme, instead of reading the build-time `statusColor` map.
 */
export const statusVar = {
  draft: 'var(--aw-status-draft)',
  active: 'var(--aw-status-active)',
  complete: 'var(--aw-status-complete)',
  attention: 'var(--aw-status-attention)',
  blocked: 'var(--aw-status-blocked)',
} as const;

export const themes: Record<ThemeName, ThemePalette> = {
  light: lightTheme,
  dark: darkTheme,
};

/** `backgroundPrimary` -> `--aw-background-primary`. */
export function cssVarName(key: keyof ThemePalette): string {
  return '--aw-' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * Semantic colours as CSS variable references.
 *
 * Shape-identical to `semantic`, so a component switching over is a one-word
 * import change and the type system catches any key that does not exist.
 */
export const themeVar = Object.fromEntries(
  (Object.keys(lightTheme) as Array<keyof ThemePalette>).map((k) => [k, `var(${cssVarName(k)})`]),
) as Record<keyof ThemePalette, string>;

/** Emit a theme as a CSS declaration block body. */
export function themeToCss(palette: ThemePalette): string {
  return (Object.keys(palette) as Array<keyof ThemePalette>)
    .map((k) => `${cssVarName(k)}: ${palette[k]};`)
    .join('');
}

/**
 * The full stylesheet: light as the default, dark applied by `data-theme`.
 *
 * `data-theme="dark"` on `<html>` wins over the media query, which is what lets
 * an explicit user choice override the OS preference — and the media query still
 * covers the "System" setting, where no attribute is set at all.
 *
 * `color-scheme` is included so form controls, scrollbars and the browser's own
 * chrome follow the theme; without it a dark page keeps light scrollbars.
 */
export function themeStylesheet(): string {
  return [
    /*
     * 🔴 THE TYPEFACE. NOTHING SET ONE UNTIL 2026-08-05.
     *
     * `primitive.fontFamily.sans` existed and was used by exactly one surface —
     * the public landing. No app layout, no shell component and no global
     * stylesheet ever applied it to `body`, so all seven applications rendered
     * in the browser's default SERIF. Screenshotted on the owner dashboard:
     * headings, KPI numerals and table cells all in Times. It is the single
     * loudest reason the product did not look commercial, and it was one
     * declaration away the whole time.
     *
     * It belongs HERE rather than in each app's layout for the same reason the
     * colours do: seven copies of a font stack is seven chances to drift, and
     * the one that drifts is the one nobody screenshots.
     *
     * `-webkit-font-smoothing` because the default weight rendering on macOS
     * makes a UI sans look heavier than designed.
     */
    `body{font-family:${primitive.fontFamily.sans};-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}`,
    /* Form controls do NOT inherit the document font — a <select>, <input> or
       <button> falls back to the UA font unless told otherwise, which is how a
       filter bar ends up in a different typeface from the page around it. */
    `input,select,textarea,button{font-family:inherit;}`,
    `:root{color-scheme:light;${themeToCss(lightTheme)}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme]){color-scheme:dark;${themeToCss(darkTheme)}}}`,
    `:root[data-theme="light"]{color-scheme:light;${themeToCss(lightTheme)}}`,
    `:root[data-theme="dark"]{color-scheme:dark;${themeToCss(darkTheme)}}`,
    // Honour reduced-motion for the sidebar width transition.
    `@media (prefers-reduced-motion: reduce){*{transition-duration:0.01ms !important;animation-duration:0.01ms !important;}}`,
  ].join('\n');
}
