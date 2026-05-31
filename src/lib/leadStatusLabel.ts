import type { TFunction } from 'i18next';

/**
 * Canonical LeadStatus label — reads `leadDetail.statusValues.<enum>` in i18n.
 * Use everywhere (leads filters, table, lead detail grid, dropdowns) so Arabic/English stay aligned.
 */
export function translateLeadStatus(t: TFunction, value: string | undefined | null): string {
    if (value === undefined || value === null || String(value).trim() === '') return '—';
    const raw = String(value).trim();
    const attempts = [raw, raw.toLowerCase()];
    for (const k of attempts) {
        const key = `leadDetail.statusValues.${k}`;
        const translated = t(key);
        if (translated !== key) return translated;
    }
    return raw.replace(/_/g, ' ');
}
