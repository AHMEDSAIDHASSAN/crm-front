import * as XLSX from 'xlsx';

/** Matches backend `excel-merge-workbook` header key rules (trimmed header or `__col_${idx}`). */
function headerKeysFromRawRow(raw: unknown[]): string[] {
    return raw.map((c, idx) => {
        const trimmed = String(c ?? '').trim();
        if (trimmed !== '') return trimmed;
        return `__col_${idx}`;
    });
}

function normalizeHeaderLabelsForMerge(rawHeader: unknown[]): string[] {
    return rawHeader.map((c, idx) => {
        const t = String(c ?? '').trim();
        return t || `Column ${idx + 1}`;
    });
}

/**
 * First sheet, row 1 — same header keys the server uses for the first sheet before merge.
 * Use these keys as `mapping` values in batch import.
 */
export async function parseFirstSheetBulkHeaders(file: File): Promise<{ keys: string[]; labels: string[] }> {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const firstName = wb.SheetNames?.[0];
    if (!firstName) return { keys: [], labels: [] };
    const ws = wb.Sheets[firstName];
    if (!ws || !ws['!ref']) return { keys: [], labels: [] };
    const raw = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: false,
    }) as unknown[][];
    const first = raw[0] ?? [];
    const labels = normalizeHeaderLabelsForMerge(first);
    const keys = headerKeysFromRawRow(first);
    return { keys, labels };
}

export type BulkImportSchemaField = 'phone' | 'name' | 'email' | 'notes' | 'priority';

export function guessBulkColumnMapping(keys: string[], labels: string[]): Record<BulkImportSchemaField, string> {
    const rows = keys.map((key, i) => ({
        key,
        label: String(labels[i] ?? ''),
        hay: `${key} ${labels[i] ?? ''}`.toLowerCase(),
    }));
    const pick = (re: RegExp) => rows.find((r) => re.test(r.hay))?.key ?? '';
    return {
        phone: pick(/phone|mobile|tel|whatsapp|cell|هاتف|موبايل|تليفون|رقم/i),
        name: pick(/name|full|customer|client|lead|contact|الاسم|عميل|العميل|اسم/i),
        email: pick(/email|e-mail|mail|بريد/i),
        notes: pick(/note|comment|desc|address|message|ملاحظ|وصف|عنوان/i),
        priority: pick(/priority|importance|level|أولوية/i),
    };
}
