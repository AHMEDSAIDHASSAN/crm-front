import * as XLSX from 'xlsx';

/** Column keys from sheet row 1; empty cells become synthetic keys (stable for mapping). */
function headerKeysFromRawRow(raw: unknown[]): string[] {
  return raw.map((c, idx) => {
    const trimmed = String(c ?? '').trim();
    if (trimmed !== '') return trimmed;
    return `__col_${idx}`;
  });
}

export function normalizeHeaderLabelsForMerge(rawHeader: unknown[]): string[] {
  return rawHeader.map((c, idx) => {
    const t = String(c ?? '').trim();
    return t || `Column ${idx + 1}`;
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

/** ≥85% header cells match (whitespace‑normalized): treat sheet’s first row as repeated header. */
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

/**
 * Flatten worksheets using **first sheet’s row 1** as headers (labels kept for detection).
 * Other sheets: if row 1 matches headers → skip; else all rows append as body.
 */
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

/** OLE compound magic — classic **.xls** (BIFF) caps sheet at ~65,536 rows. */
export function isLegacyXlsBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 8) return false;
  return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}
