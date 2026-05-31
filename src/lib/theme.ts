const STORAGE_KEY = 'sira-theme';

export type ThemeMode = 'light' | 'dark';

/** First visit and invalid stored values use light mode. */
export const DEFAULT_THEME: ThemeMode = 'light';

export function getStoredTheme(): ThemeMode {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
    return DEFAULT_THEME;
}

export function applyTheme(mode: ThemeMode) {
    const root = document.documentElement;

    if (mode === 'dark') {
        root.classList.add('dark');
        // Tell the browser to render native controls (inputs, scrollbars, date pickers)
        // in dark mode — e.g. Safari on iOS will not auto-darken the page independently.
        root.style.colorScheme = 'dark';
    } else {
        root.classList.remove('dark');
        // Force light native controls regardless of the phone's OS dark mode setting.
        root.style.colorScheme = 'only light';
    }

    localStorage.setItem(STORAGE_KEY, mode);
}
