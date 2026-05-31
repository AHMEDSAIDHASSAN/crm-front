export type PublishLinks = {
    places: Array<{ name: string; link: string }>;
};

export const UNIT_TYPE_OPTIONS = [
    { value: 'd', label: 'Apartment' },
    { value: 'v', label: 'Villa' },
    { value: 'st', label: 'Studio' },
    { value: 's', label: 'Chalet' },
    { value: 'c', label: 'Commercial' },
    { value: 'ph', label: 'Penthouse' },
] as const;

export function stringArrayFromJson(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
}

export function normalizeUnitType(value: string | null | undefined) {
    const v = (value ?? '').toLowerCase().trim();
    if (v === 's' || v === 'shallea' || v === 'chalet') return 's';
    if (v === 'v' || v === 'villa') return 'v';
    if (
        v === 'd' ||
        v === 'department' ||
        v === 'apartment' ||
        v === 'adpartment' ||
        v === 'appartment' ||
        v === 'شقة' ||
        v === 'شقه'
    ) return 'd';
    if (v === 'st' || v === 'studio') return 'st';
    if (v === 'c' || v === 'commercial') return 'c';
    if (v === 'ph' || v === 'penthouse') return 'ph';
    return 'd';
}

/** Mirrors backend `units.service` getCodePrefixFromUnitType for labels / previews. */
export function serverUnitTypeCodePrefix(unitType: string | null | undefined): string {
    const n = normalizeUnitType(unitType ?? '');
    if (n === 's') return 'S';
    if (n === 'd') return 'A';
    if (n === 'st') return 'T';
    if (n === 'c') return 'C';
    if (n === 'ph') return 'P';
    if (n === 'v') return 'V';
    return 'V';
}

/** Example pattern for auto-generated codes: PREFIX-1000 (single preview). */
export function unitCodeAutoPatternPreview(unitType: string | null | undefined): string {
    return `${serverUnitTypeCodePrefix(unitType)}-1000`;
}

export function getUnitTypeLabel(value: string | null | undefined) {
    if (!value) return '';
    const normalized = normalizeUnitType(value);
    const found = UNIT_TYPE_OPTIONS.find((o) => o.value === normalized);
    if (found) return found.label;
    const legacy = [
        { match: /^s$/i, label: 'Chalet' },
        { match: /shallea/i, label: 'Chalet' },
        { match: /^d$/i, label: 'Apartment' },
        { match: /department/i, label: 'Apartment' },
    ];
    for (const { match, label } of legacy) {
        if (match.test(String(value).trim())) return label;
    }
    return value;
}

export function formatPublishName(value: string | null | undefined) {
    const raw = (value ?? '').trim();
    if (!raw) return 'Publish Link';
    return raw
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

import { formatMoney } from './currency';

export function formatMoneyDelegate(n: string | number | null | undefined) {
    return formatMoney(n);
}

// Keep the export name the same for compatibility
export { formatMoney };

export function formatDate(d: string | null | undefined) {
    if (!d) return '—';
    const s = typeof d === 'string' ? d.slice(0, 10) : '';
    if (!s) return '—';
    return s;
}

export function parsePublishedLinks(value: string | null | undefined): PublishLinks {
    if (!value) return { places: [] };
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
            if (Array.isArray((parsed as any).places)) {
                const places = (parsed as any).places
                    .map((p: any) => ({
                        name: typeof p?.name === 'string' ? p.name.trim() : '',
                        link: typeof p?.link === 'string' ? p.link.trim() : '',
                    }))
                    .filter((p: { name: string; link: string }) => p.name && p.link);
                return { places };
            }
            const places: Array<{ name: string; link: string }> = [];
            if (typeof (parsed as any).byoa === 'string' && (parsed as any).byoa.trim()) {
                places.push({ name: 'BYOA', link: (parsed as any).byoa.trim() });
            }
            if (
                typeof (parsed as any).realEstateCampaign === 'string' &&
                (parsed as any).realEstateCampaign.trim()
            ) {
                places.push({
                    name: 'Real Estate Campaign',
                    link: (parsed as any).realEstateCampaign.trim(),
                });
            }
            return { places };
        }
    } catch {
        return { places: [{ name: 'Published Link', link: value }] };
    }
    return { places: [] };
}

export const unitStatusStyles: Record<string, string> = {
    available: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    reserved: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    sold: 'bg-foreground/10 text-foreground/70 border-foreground/20',
    unavailable: 'bg-red-500/15 text-red-300 border-red-500/30',
};
