/**
 * Sidebar / layout RTL: use the same source as the app language toggle (i18n),
 * so the shell updates immediately when the user switches EN ↔ AR.
 */
export function isAppRtl(i18n: { language?: string; resolvedLanguage?: string }): boolean {
    const raw = String(i18n.resolvedLanguage || i18n.language || 'en').toLowerCase();
    const base = raw.split('-')[0];
    return base === 'ar';
}
