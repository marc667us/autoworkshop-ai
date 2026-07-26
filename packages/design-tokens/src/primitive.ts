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
  space: { 0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem',
           6: '1.5rem', 8: '2rem', 12: '3rem', 16: '4rem' },
  radius: { none: '0', sm: '0.25rem', md: '0.375rem', lg: '0.5rem', full: '9999px' },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem',
              xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem' },
} as const;
