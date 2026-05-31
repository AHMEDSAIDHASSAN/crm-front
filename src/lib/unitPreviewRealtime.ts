/** Lets the Units page refetch preview lists when the bell receives a unit/preview notification (same tab, no extra socket). */

const listeners = new Set<() => void>();

export function subscribeUnitPreviewActivity(callback: () => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

export function emitUnitPreviewActivity(): void {
    listeners.forEach((cb) => {
        try {
            cb();
        } catch {
            /* ignore subscriber errors */
        }
    });
}
