/**
 * Primitive tokens — raw values, the base of the token hierarchy
 * (`autoworkshop 01 (1).txt` §64: primitive -> semantic -> component).
 *
 * IN ITS OWN MODULE ON PURPOSE. Both `index.ts` (for `semantic`) and
 * `themes.ts` (for the light/dark palettes) need these. If `themes.ts` imported
 * them from `index.ts` — which re-exports `themes.ts` — the cycle puts
 * `primitive` in the temporal dead zone and the app dies at module init with
 * "Cannot access 'a' before initialization". A leaf module has no such cycle.
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
  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.25rem',
           6: '1.5rem', 7: '1.75rem', 8: '2rem', 12: '3rem', 16: '4rem' },
  /**
   * `xl` and `2xl` exist for CARDS specifically.
   *
   * The scale stopped at `lg` (8px), which is right for a control — an input, a
   * button, a badge — and reads as cramped on a marketing surface. Solar's
   * landing, the reference implementation for this product's public pages, uses
   * 12px on its smaller cards and 16px on its larger ones, and the AutoWorkshop
   * landing looked tighter than it beside them for exactly this reason.
   * Added to the scale rather than hardcoded at the call site, so the two pages
   * cannot drift apart again one literal at a time.
   */
  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem',
            xl: '0.75rem', '2xl': '1rem', full: '9999px' },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
              xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
  /**
   * `01 (1).txt` §2845: "One optional monospaced font for VINs, part numbers,
   * fault codes and technical identifiers."
   *
   * Not decoration. These are values a human reads character by character off a
   * number plate, a parts invoice or a scan tool, and in a proportional face
   * `0`/`O` and `1`/`I`/`l` are genuinely ambiguous — a misread VIN orders the
   * wrong part. The stack is system fonts only, so it costs no download and no
   * paid licence (ADR-012).
   *
   * SYSTEM STACKS, no webfont: `sans` is here so the mono choice is not the only
   * typographic value in the system and the pair stays visible together.
   */
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
} as const;
