export type DeductionRow = { id: string | number; amount: number; reason: string; createdAt: string };
export type CommissionRow = {
    id: string | number;
    title: string;
    amount: number | null;
    saleDate: string;
    dueNote: string | null;
    status: 'pending_collection' | 'collected';
    collectedAt: string | null;
    createdAt: string;
};

export type FinanceEmployee = {
    id: string | number;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string | null;
    title?: string | null;
    team?: { id: string | number; name: string } | null;
    basicSalary: number;
    deductions: DeductionRow[];
    deductionsTotal: number;
    netAfterDeductions: number;
    commissions: CommissionRow[];
    commissionsPendingCount: number;
    commissionsCollectedCount: number;
};

export const FINANCE_ROLES = ['super_admin', 'hr'] as const;

export function formatFinanceMoney(n: number | null | undefined) {
    if (n == null || Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('en-EG', {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0,
    }).format(n);
}

export function formatFinanceDate(iso: string) {
    try {
        return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' });
    } catch {
        return iso;
    }
}
