/**
 * Accessibility settings (Settings → Accessibility), kept on this device like
 * the colour theme: larger text, stronger contrast and less motion. Applied to
 * <html> by the pre-paint script in layout.tsx and again when changed, so the
 * page never flashes back to the defaults.
 *
 *   text size  scales the root font size; everything is sized in rem
 *   contrast   the "high-contrast" class darkens secondary text and borders (globals.css)
 *   motion     the "reduce-motion" class turns off animations and transitions
 */

export const A11Y_KEY = "prep-calculator:a11y";

export type TextSize = "default" | "large" | "larger";

export interface A11ySettings {
  textSize: TextSize;
  highContrast: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_A11Y: A11ySettings = { textSize: "default", highContrast: false, reduceMotion: false };

export const TEXT_SCALE: Record<TextSize, string> = { default: "100%", large: "112.5%", larger: "125%" };

export function readA11y(): A11ySettings {
  try {
    const raw = JSON.parse(window.localStorage.getItem(A11Y_KEY) ?? "null") as Partial<A11ySettings> | null;
    return {
      textSize: raw?.textSize === "large" || raw?.textSize === "larger" ? raw.textSize : "default",
      highContrast: raw?.highContrast === true,
      reduceMotion: raw?.reduceMotion === true,
    };
  } catch {
    return DEFAULT_A11Y;
  }
}

export function applyA11y(s: A11ySettings): void {
  const html = document.documentElement;
  html.style.fontSize = TEXT_SCALE[s.textSize];
  html.classList.toggle("high-contrast", s.highContrast);
  html.classList.toggle("reduce-motion", s.reduceMotion);
}

export function saveA11y(s: A11ySettings): void {
  applyA11y(s);
  try {
    window.localStorage.setItem(A11Y_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked in a third-party frame; applies for this visit */
  }
}

/** The same, as the inline pre-paint script (layout.tsx). Keep in step with applyA11y. */
export const A11Y_SCRIPT = `
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('${A11Y_KEY}') || 'null');
    if (!s) return;
    var h = document.documentElement;
    if (s.textSize === 'large') h.style.fontSize = '112.5%';
    if (s.textSize === 'larger') h.style.fontSize = '125%';
    if (s.highContrast) h.classList.add('high-contrast');
    if (s.reduceMotion) h.classList.add('reduce-motion');
  } catch (e) {}
})();
`;
