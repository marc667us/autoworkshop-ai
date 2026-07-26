'use client';

import * as React from 'react';
import { themeStylesheet, themeVar, primitive, type ThemeName } from '@autoworkshop/design-tokens';

/**
 * Theme selection — user preference, persisted, with a System option.
 *
 * Three choices, not two. "System" is the default because an OS-level dark
 * preference is a real accessibility setting (light sensitivity, migraine
 * triggers), and defaulting to a fixed theme silently overrides it. Once the
 * user picks explicitly, that choice wins on every device they use this browser
 * on until they change it.
 */

export type ThemePreference = ThemeName | 'system';

const STORAGE_KEY = 'aw-theme';

interface ThemeContextValue {
  preference: ThemePreference;
  /** What is actually being displayed once `system` is resolved. */
  resolved: ThemeName;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Blocking script that applies the stored theme BEFORE first paint.
 *
 * Without this the server renders light, the client reads localStorage, and the
 * user sees a white flash on every navigation — the "flash of incorrect theme".
 * It has to be inline and synchronous in <head>: a React effect runs after
 * paint, which is exactly too late.
 *
 * Wrapped in try/catch because localStorage throws in Safari private mode and
 * under some cookie-blocking settings. A theme preference is never worth taking
 * the page down for.
 */
export const themeBootScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');if(p==='dark'||p==='light'){document.documentElement.setAttribute('data-theme',p);}}catch(e){}})();`;

export function ThemeProvider({
  children,
  defaultPreference = 'system',
}: {
  children: React.ReactNode;
  defaultPreference?: ThemePreference;
}) {
  const [preference, setPreferenceState] = React.useState<ThemePreference>(defaultPreference);
  const [systemDark, setSystemDark] = React.useState(false);

  // Read the stored preference after mount. Deliberately not during render:
  // the server has no localStorage, and reading it in a useState initialiser
  // produces a hydration mismatch. The boot script above has already applied
  // the visual theme, so there is no flash while this catches up.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        setPreferenceState(stored);
      }
    } catch {
      /* storage unavailable — stay on the default */
    }
  }, []);

  // Track the OS preference so the System option stays live rather than being
  // sampled once at load.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ThemeName = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  const setPreference = React.useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore — the in-memory choice still applies for this session */
    }
    const root = document.documentElement;
    if (p === 'system') {
      // Remove the attribute entirely so the media query in the stylesheet
      // takes over again. Setting it to a resolved value would freeze the
      // choice and stop tracking the OS.
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', p);
    }
  }, []);

  const value = React.useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <style dangerouslySetInnerHTML={{ __html: themeStylesheet() }} />
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Theme switcher for the top navigation.
 *
 * A three-way segmented control rather than a two-state toggle: a toggle cannot
 * express "follow the system", and an icon-only toggle also cannot tell you
 * which mode you are currently in without decoding the icon.
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  const options: Array<{ value: ThemePreference; label: string; glyph: string }> = [
    { value: 'light', label: 'Light theme', glyph: '☀' },
    { value: 'dark', label: 'Dark theme', glyph: '☾' },
    { value: 'system', label: 'Follow system theme', glyph: '◐' },
  ];

  const radioRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  /**
   * Arrow-key navigation, required by the ARIA radiogroup pattern.
   *
   * Declaring `role="radiogroup"` is a promise about keyboard behaviour, not
   * just a label: a screen-reader user is told these are radios, and then
   * expects arrows to move between them and Tab to leave the group entirely.
   * Without this the three buttons were three separate tab stops that ignored
   * arrows — the control announced itself as one thing and behaved as another,
   * which is worse than having used plain buttons.
   *
   * Unlike the tab strip, a radio group selects ON ARROW: moving focus within a
   * radiogroup changes the selection. That is the specified behaviour, and here
   * it is also harmless — switching theme costs nothing and is instantly
   * reversible.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, current: ThemePreference) => {
    const order = options.map((o) => o.value);
    const i = order.indexOf(current);
    let next: ThemePreference | undefined;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = order[(i + 1) % order.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = order[(i - 1 + order.length) % order.length];
        break;
      case 'Home':
        next = order[0];
        break;
      case 'End':
        next = order[order.length - 1];
        break;
      default:
        return;
    }
    if (!next) return;
    e.preventDefault();
    setPreference(next);
    radioRefs.current[next]?.focus();
  };

  return (
    // role="radiogroup": these are mutually exclusive choices, so a screen
    // reader should announce "2 of 3 selected", not three unrelated buttons.
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: 'inline-flex',
        border: `1px solid ${themeVar.borderDefault}`,
        borderRadius: primitive.radius.md,
        overflow: 'hidden',
      }}
    >
      {options.map((o) => {
        const selected = preference === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              radioRefs.current[o.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.label}
            title={o.label}
            // Roving tabindex: the group is ONE tab stop, and Tab moves past it
            // rather than through all three options.
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, o.value)}
            onClick={() => setPreference(o.value)}
            style={{
              width: '2rem',
              height: '2rem',
              border: 'none',
              cursor: 'pointer',
              background: selected ? themeVar.actionPrimarySoft : 'transparent',
              color: selected ? themeVar.actionPrimary : themeVar.textSecondary,
              fontSize: primitive.fontSize.sm,
              lineHeight: 1,
            }}
          >
            <span aria-hidden="true">{o.glyph}</span>
          </button>
        );
      })}
    </div>
  );
}
