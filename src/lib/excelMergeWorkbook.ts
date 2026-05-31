import * as XLSX from 'xlsx';

/** Must stay in sync with backend `excel-merge-workbook.ts` merge rules. */

function normalizeHeaderLabelsForMerge(rawHeader: unknown[]): string[] {
  return rawHeader.map((c, idx) => {
    const t = String(c ?? '').trim();
    return t || `Column ${idx + 1}`;
  });
}

function headerKeysFromRawRow(raw: unknown[]): string[] {
  return raw.map((c, idx) => {
    const trimmed = String(c ?? '').trim();
    if (trimmed !== '') return trimmed;
    return `__col_${idx}`;
  });
}

function padRow(row: unknown[], len: number): unknown[] {
  const r = [...(Array.isArray(row) ? row : [])];
  while (r.length < len) r.push('');
  return r.slice(0, len);
}

function isEffectivelyBlank(row: unknown[]): boolean {
  return row.every((c) => {
    if (c == null) return true;
    if (typeof c === 'string') return c.trim() === '';
    return false;
  });
}

function rowsLookLikeRepeatedHeader(firstRow: unknown[], headerLabels: string[]): boolean {
  const n = headerLabels.length;
  if (!n || firstRow.length < n * 0.5) return false;
  let matches = 0;
  for (let i = 0; i < n; i++) {
    const a = String(firstRow[i] ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    const b = String(headerLabels[i] ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
    if (a && b && a === b) matches++;
  }
  return matches / Math.max(n, 1) >= 0.85;
}

export function mergeWorkbookSheetsToRecords(wb: XLSX.WorkBook): {
  records: Record<string, unknown>[];
  headerLabelsForUi: string[];
} {
  const records: Record<string, unknown>[] = [];
  let headerKeys: string[] | null = null;
  let headerLabelsForUi: string[] = [];

  function rowObjects(header: string[], values: unknown[]) {
    const obj: Record<string, unknown> = {};
    header.forEach((k, i) => {
      obj[k] = values[i] ?? '';
    });
    return obj;
  }

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;

    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown[][];

    if (raw.length === 0) continue;

    if (headerKeys === null) {
      const first = raw[0] ?? [];
      headerLabelsForUi = normalizeHeaderLabelsForMerge(first);
      headerKeys = headerKeysFromRawRow(first);
      for (let r = 1; r < raw.length; r++) {
        const rr = padRow(raw[r], headerKeys!.length);
        if (isEffectivelyBlank(rr)) continue;
        records.push(rowObjects(headerKeys!, rr));
      }
    } else {
      let startIdx = 0;
      const first = padRow(raw[0] ?? [], headerKeys!.length);
      if (rowsLookLikeRepeatedHeader(first, headerLabelsForUi)) {
        startIdx = 1;
      }
      for (let r = startIdx; r < raw.length; r++) {
        const rr = padRow(raw[r], headerKeys!.length);
        if (isEffectivelyBlank(rr)) continue;
        records.push(rowObjects(headerKeys!, rr));
      }
    }
  }

  return { records, headerLabelsForUi };
}

/** Classic OLE compound (= old .xls). Max **65,536 rows per sheet**. */
export function isLegacyXlsBufferLike(buf: ArrayBuffer | Uint8Array | null | undefined): boolean {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  if (!bytes || bytes.length < 8) return false;
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}
