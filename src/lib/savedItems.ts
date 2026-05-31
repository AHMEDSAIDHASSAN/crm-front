export type SavedLeadItem = {
    id: number;
    name: string;
    phone?: string;
};

export type SavedUnitItem = {
    id: number;
    code: string;
    projectName?: string;
};

const LEADS_KEY = 'sira_saved_leads_v1';
const UNITS_KEY = 'sira_saved_units_v1';

function readJson<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function writeJson<T>(key: string, value: T[]): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

export function getSavedLeads(): SavedLeadItem[] {
    return readJson<SavedLeadItem>(LEADS_KEY);
}

export function getSavedUnits(): SavedUnitItem[] {
    return readJson<SavedUnitItem>(UNITS_KEY);
}

export function setSavedLeads(items: SavedLeadItem[]): void {
    writeJson(LEADS_KEY, items);
}

export function setSavedUnits(items: SavedUnitItem[]): void {
    writeJson(UNITS_KEY, items);
}

export function isLeadSaved(id: number): boolean {
    return getSavedLeads().some((x) => Number(x.id) === Number(id));
}

export function isUnitSaved(id: number): boolean {
    return getSavedUnits().some((x) => Number(x.id) === Number(id));
}

export function toggleSavedLead(item: SavedLeadItem): boolean {
    const curr = getSavedLeads();
    const exists = curr.some((x) => Number(x.id) === Number(item.id));
    if (exists) {
        writeJson(
            LEADS_KEY,
            curr.filter((x) => Number(x.id) !== Number(item.id)),
        );
        return false;
    }
    writeJson(LEADS_KEY, [{ ...item }, ...curr].slice(0, 200));
    return true;
}

export function toggleSavedUnit(item: SavedUnitItem): boolean {
    const curr = getSavedUnits();
    const exists = curr.some((x) => Number(x.id) === Number(item.id));
    if (exists) {
        writeJson(
            UNITS_KEY,
            curr.filter((x) => Number(x.id) !== Number(item.id)),
        );
        return false;
    }
    writeJson(UNITS_KEY, [{ ...item }, ...curr].slice(0, 200));
    return true;
}

