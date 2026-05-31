import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    ArrowLeft,
    HandCoins,
    Loader2,
    CheckCircle2,
    Clock,
    User,
    Building2,
} from 'lucide-react';
import { getUserRoleName } from '../lib/userRole';
import {
    FINANCE_ROLES,
    formatFinanceDate,
    formatFinanceMoney,
    type FinanceEmployee,
} from '../lib/financeShared';
import {
    getFinanceSalesOverview,
    createFinanceDeduction,
    createFinanceCommission,
    collectFinanceCommission,
} from '../services/api';
import { toast } from '../lib/toast';
import Modal from '../components/ui/Modal';

export default function FinanceEmployeeDetail() {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const canAccess = (FINANCE_ROLES as readonly string[]).includes(roleName);

    const [loading, setLoading] = useState(true);
    const [emp, setEmp] = useState<FinanceEmployee | null>(null);

    const [deductOpen, setDeductOpen] = useState(false);
    const [deductAmount, setDeductAmount] = useState('');
    const [deductReason, setDeductReason] = useState('');
    const [deductSaving, setDeductSaving] = useState(false);

    const [commOpen, setCommOpen] = useState(false);
    const [commTitle, setCommTitle] = useState('');
    const [commSaleDate, setCommSaleDate] = useState('');
    const [commDueNote, setCommDueNote] = useState('');
    const [commAmount, setCommAmount] = useState('');
    const [commSaving, setCommSaving] = useState(false);

    const [collectingId, setCollectingId] = useState<string | number | null>(null);

    const load = useCallback(async () => {
        if (!canAccess || !userId) return;
        setLoading(true);
        try {
            const data = await getFinanceSalesOverview();
            const list: FinanceEmployee[] = Array.isArray(data?.employees) ? data.employees : [];
            const found = list.find((e) => String(e.id) === String(userId)) ?? null;
            setEmp(found);
        } catch (e: unknown) {
            const msg =
                e && typeof e === 'object' && 'response' in e
                    ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            toast.error(msg || 'Failed to load finance data');
            setEmp(null);
        } finally {
            setLoading(false);
        }
    }, [canAccess, userId]);

    useEffect(() => {
        if (user && !canAccess) {
            navigate('/dashboard', { replace: true });
        }
    }, [user, canAccess, navigate]);

    useEffect(() => {
        load();
    }, [load]);

    const openDeduction = () => {
        setDeductAmount('');
        setDeductReason('');
        setDeductOpen(true);
    };

    const submitDeduction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        const amount = parseFloat(deductAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('Enter a valid deduction amount');
            return;
        }
        if (!deductReason.trim()) {
            toast.error('Reason is required');
            return;
        }
        setDeductSaving(true);
        try {
            await createFinanceDeduction({
                userId: Number(userId),
                amount,
                reason: deductReason.trim(),
            });
            toast.success('Deduction recorded');
            setDeductOpen(false);
            load();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            toast.error(msg || 'Failed to add deduction');
        } finally {
            setDeductSaving(false);
        }
    };

    const openCommission = () => {
        setCommTitle('');
        setCommSaleDate(new Date().toISOString().slice(0, 10));
        setCommDueNote('');
        setCommAmount('');
        setCommOpen(true);
    };

    const submitCommission = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        if (!commTitle.trim()) {
            toast.error('Commission title / details are required');
            return;
        }
        if (!commSaleDate) {
            toast.error('Sale date is required');
            return;
        }
        setCommSaving(true);
        try {
            const body: Parameters<typeof createFinanceCommission>[0] = {
                userId: Number(userId),
                title: commTitle.trim(),
                saleDate: commSaleDate,
                dueNote: commDueNote.trim() || undefined,
            };
            const amt = parseFloat(commAmount);
            if (Number.isFinite(amt) && amt >= 0) body.amount = amt;
            await createFinanceCommission(body);
            toast.success('Commission registered (pending collection)');
            setCommOpen(false);
            load();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            toast.error(msg || 'Failed to add commission');
        } finally {
            setCommSaving(false);
        }
    };

    const handleCollect = async (commissionId: string | number) => {
        setCollectingId(commissionId);
        try {
            await collectFinanceCommission(commissionId);
            toast.success('Marked as collected');
            load();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : undefined;
            toast.error(msg || 'Update failed');
        } finally {
            setCollectingId(null);
        }
    };

    if (!canAccess) return null;

    if (loading) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sira-text-muted">
                <Loader2 className="h-8 w-8 animate-spin text-sira-gold" />
                <span className="text-sm font-semibold">Loading…</span>
            </div>
        );
    }

    if (!emp) {
        return (
            <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
                <p className="text-sira-text-muted">Employee not found in finance overview.</p>
                <Link
                    to="/finance"
                    className="inline-flex items-center gap-2 rounded-xl bg-sira-gold px-4 py-2 text-sm font-bold text-sira-gold-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Finance
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-wrap items-center gap-3">
                <Link
                    to="/finance"
                    className="inline-flex items-center gap-2 rounded-xl border border-sira-border bg-sira-bg-card px-3 py-2 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Finance
                </Link>
            </div>

            <div className="flex flex-col gap-4 border-b border-sira-border pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-secondary/30 bg-sira-gold/15 dark:bg-sira-gold/20">
                        <HandCoins className="h-7 w-7 text-sira-gold" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-foreground">
                            {emp.firstName} {emp.lastName}
                        </h1>
                        <p className="mt-1 text-sm text-sira-text-muted">{emp.email}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {emp.title ? (
                                <span className="inline-flex items-center rounded-lg border border-sira-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground/80 dark:bg-muted/40">
                                    {emp.title}
                                </span>
                            ) : null}
                            {emp.team?.name ? (
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-sira-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-foreground/80 dark:bg-muted/40">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {emp.team.name}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={openDeduction}
                        className="rounded-xl border border-amber-600/25 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-900 hover:bg-amber-500/15 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100 dark:hover:bg-amber-500/20"
                    >
                        Add deduction
                    </button>
                    <button
                        type="button"
                        onClick={openCommission}
                        className="rounded-xl border border-emerald-600/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-500/15 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
                    >
                        Add commission
                    </button>
                </div>
            </div>

            {/* Summary row — cards in a horizontal row */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
                {[
                    { label: 'Basic salary', value: formatFinanceMoney(emp.basicSalary), tone: 'default' as const },
                    {
                        label: 'Deductions (total)',
                        value: formatFinanceMoney(emp.deductionsTotal),
                        tone: 'amber' as const,
                    },
                    {
                        label: 'Net after deductions',
                        value: formatFinanceMoney(emp.netAfterDeductions),
                        tone: 'secondary' as const,
                    },
                    { label: 'Pending commissions', value: String(emp.commissionsPendingCount), tone: 'amber' as const },
                    {
                        label: 'Collected commissions',
                        value: String(emp.commissionsCollectedCount),
                        tone: 'emerald' as const,
                    },
                ].map((card) => (
                    <div
                        key={card.label}
                        className={`rounded-2xl border p-4 shadow-sm ${
                            card.tone === 'amber'
                                ? 'border-amber-200/80 bg-amber-50/90 dark:border-amber-500/25 dark:bg-amber-500/5'
                                : card.tone === 'emerald'
                                  ? 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-500/25 dark:bg-emerald-500/5'
                                  : card.tone === 'secondary'
                                    ? 'border-secondary/30 bg-sira-gold/10 dark:bg-sira-gold/15'
                                    : 'border-sira-border bg-sira-bg-card dark:bg-sira-bg-card/80'
                        }`}
                    >
                        <p className="text-[10px] font-black uppercase tracking-wider text-sira-text-muted">{card.label}</p>
                        <p
                            className={`mt-2 text-lg font-black tabular-nums tracking-tight ${
                                card.tone === 'amber'
                                    ? 'text-amber-900 dark:text-amber-100'
                                    : card.tone === 'emerald'
                                      ? 'text-emerald-900 dark:text-emerald-100'
                                      : card.tone === 'secondary'
                                        ? 'text-sira-gold'
                                        : 'text-foreground'
                            }`}
                        >
                            {card.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Deductions — full-width table */}
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-sira-text-muted" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Deductions</h2>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-sira-border bg-sira-bg-card shadow-sm">
                    {emp.deductions.length === 0 ? (
                        <p className="p-8 text-center text-sm text-sira-text-muted">No deductions on file.</p>
                    ) : (
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-sira-border bg-muted/50 text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                    <th className="px-4 py-3">Date recorded</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emp.deductions.map((d) => (
                                    <tr key={String(d.id)} className="border-b border-sira-border/60 last:border-0">
                                        <td className="px-4 py-3 text-sira-text-muted">{formatFinanceDate(d.createdAt)}</td>
                                        <td className="px-4 py-3 font-mono font-bold text-amber-900 dark:text-amber-100">
                                            {formatFinanceMoney(d.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-foreground">{d.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {/* Commissions — one row per commission with all columns */}
            <section className="space-y-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Commissions</h2>
                <div className="overflow-x-auto rounded-2xl border border-sira-border bg-sira-bg-card shadow-sm">
                    {emp.commissions.length === 0 ? (
                        <p className="p-8 text-center text-sm text-sira-text-muted">No commissions yet.</p>
                    ) : (
                        <table className="w-full min-w-[960px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-sira-border bg-muted/50 text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                    <th className="px-4 py-3">Title / details</th>
                                    <th className="px-4 py-3">Sale date</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Due / payout note</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {emp.commissions.map((c) => (
                                    <tr key={String(c.id)} className="border-b border-sira-border/60 align-top last:border-0">
                                        <td className="px-4 py-3 font-semibold text-foreground">{c.title}</td>
                                        <td className="px-4 py-3 text-sira-text-muted">{formatFinanceDate(c.saleDate)}</td>
                                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                                            {c.amount != null ? formatFinanceMoney(c.amount) : '—'}
                                        </td>
                                        <td className="max-w-[220px] px-4 py-3 text-sira-text-muted">
                                            {c.dueNote ? <span className="italic">{c.dueNote}</span> : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {c.status === 'collected' ? (
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-100/80 px-2 py-1 text-[10px] font-black uppercase text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Collected
                                                    {c.collectedAt ? ` · ${formatFinanceDate(c.collectedAt)}` : ''}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100/80 px-2 py-1 text-[10px] font-black uppercase text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-100">
                                                    <Clock className="h-3 w-3" />
                                                    Pending
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sira-text-muted">{formatFinanceDate(c.createdAt)}</td>
                                        <td className="px-4 py-3 text-right">
                                            {c.status === 'pending_collection' ? (
                                                <button
                                                    type="button"
                                                    disabled={collectingId === c.id}
                                                    onClick={() => handleCollect(c.id)}
                                                    className="rounded-lg bg-sira-gold px-3 py-1.5 text-[11px] font-black text-sira-gold-foreground hover:bg-sira-gold/90 disabled:opacity-50"
                                                >
                                                    {collectingId === c.id ? (
                                                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                                                    ) : (
                                                        'Mark collected'
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-sira-text-muted">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            <Modal
                isOpen={deductOpen}
                onClose={() => !deductSaving && setDeductOpen(false)}
                title="Add deduction"
            >
                <form onSubmit={submitDeduction} className="space-y-4">
                    <p className="text-xs text-sira-text-muted">
                        Applies to this employee and appears in their finance record.
                    </p>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Amount (EGP)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={deductAmount}
                            onChange={(e) => setDeductAmount(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Reason</label>
                        <textarea
                            value={deductReason}
                            onChange={(e) => setDeductReason(e.target.value)}
                            rows={3}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setDeductOpen(false)}
                            className="rounded-xl px-4 py-2 text-sm font-bold text-sira-text-muted hover:bg-muted"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={deductSaving}
                            className="rounded-xl bg-sira-gold px-4 py-2 text-sm font-black text-sira-gold-foreground disabled:opacity-50"
                        >
                            {deductSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={commOpen} onClose={() => !commSaving && setCommOpen(false)} title="Add commission">
                <form onSubmit={submitCommission} className="space-y-4">
                    <p className="text-xs text-sira-text-muted">
                        Status starts as <strong>pending collection</strong>. Use the due note for flexible text.
                    </p>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Title / details</label>
                        <input
                            value={commTitle}
                            onChange={(e) => setCommTitle(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Sale date</label>
                        <input
                            type="date"
                            value={commSaleDate}
                            onChange={(e) => setCommSaleDate(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Due / payout note (optional)</label>
                        <textarea
                            value={commDueNote}
                            onChange={(e) => setCommDueNote(e.target.value)}
                            rows={2}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase text-sira-text-muted">Amount EGP (optional)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={commAmount}
                            onChange={(e) => setCommAmount(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-sira-border bg-sira-bg-page px-3 py-2 text-sm"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setCommOpen(false)}
                            className="rounded-xl px-4 py-2 text-sm font-bold text-sira-text-muted hover:bg-muted"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={commSaving}
                            className="rounded-xl bg-sira-gold px-4 py-2 text-sm font-black text-sira-gold-foreground disabled:opacity-50"
                        >
                            {commSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

