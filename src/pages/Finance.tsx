import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    Plus, Loader2, User, PanelRightOpen, Building2,
    LayoutDashboard, Banknote, Receipt, FileText, CreditCard,
    TrendingUp, TrendingDown, Wallet, CheckCircle2, XCircle,
    Lock, Trash2, Pencil, Calendar, ArrowUpCircle,
    ArrowDownCircle, Percent,
} from 'lucide-react';
import { getUserRoleName } from '../lib/userRole';
import { FINANCE_ROLES, formatFinanceDate, formatFinanceMoney, type FinanceEmployee } from '../lib/financeShared';
import {
    getFinanceSalesOverview, createFinanceDeduction, createFinanceCommission, collectFinanceCommission,
    getFinanceDashboard, getPayrollRun, closePayrollRun, markPayrollEntryPaid, listPayrollRuns,
    listFinanceTransactions, createFinanceTransaction, deleteFinanceTransaction,
    listFixedBills, createFixedBill, updateFixedBill, deleteFixedBill,
    listCommissionRates, createCommissionRate, updateCommissionRate, deleteCommissionRate,
    createCommissionFromRate,
} from '../services/api';
import { toast } from '../lib/toast';
import Modal from '../components/ui/Modal';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';

type Tab = 'dashboard' | 'payroll' | 'transactions' | 'fixed-bills' | 'sales' | 'commission-rates';

const fmt = (n: number, lang?: string) =>
    n.toLocaleString(lang?.startsWith('ar') ? 'ar-EG' : 'en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const currentMonth = () => new Date().toISOString().slice(0, 7);

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ lang }: { lang: string }) {
    const [month, setMonth] = useState(currentMonth());
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getFinanceDashboard(month).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
    }, [month]);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sira-gold" /></div>;

    const kpis = data ? [
        { label: 'الإيرادات', value: data.totalIncome, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
        { label: 'المصروفات', value: data.totalExpenses, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
        { label: 'الفواتير الثابتة', value: data.fixedBillsTotal, icon: Receipt, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
        { label: 'تكلفة المرتبات', value: data.payrollCost, icon: Banknote, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
        { label: 'رصيد الخزنة', value: data.balance, icon: Wallet, color: data.balance >= 0 ? 'text-emerald-700' : 'text-red-700', bg: data.balance >= 0 ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300' },
    ] : [];

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-sira-text-primary">لوحة المالية</h2>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                    className="rounded-xl border border-sira-border bg-white px-3 py-2 text-[12px] font-bold text-sira-text-primary outline-none focus:border-sira-gold" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {kpis.map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className={`rounded-2xl border p-5 ${bg}`}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black uppercase tracking-wider text-sira-text-muted">{label}</p>
                            <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <p className={`text-xl font-black tabular-nums ${color}`}>{fmt(value, lang)}</p>
                        <p className="text-[10px] font-bold text-sira-text-muted">ج.م</p>
                    </div>
                ))}
            </div>

            {data?.expenseByCategory && Object.keys(data.expenseByCategory).length > 0 && (
                <div className="rounded-2xl border border-sira-border bg-white p-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.25em] text-sira-text-muted mb-4">المصروفات بالفئة</p>
                    <div className="space-y-3">
                        {Object.entries(data.expenseByCategory).sort((a: any, b: any) => b[1] - a[1]).map(([cat, amt]: any) => {
                            const pct = data.totalExpenses > 0 ? (amt / data.totalExpenses) * 100 : 0;
                            return (
                                <div key={cat}>
                                    <div className="flex justify-between text-[12px] font-bold mb-1">
                                        <span className="text-sira-text-primary">{cat}</span>
                                        <span className="text-sira-text-muted tabular-nums">{fmt(amt, lang)} ج.م</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-sira-brown rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                    { label: 'إجمالي الصادر', value: data?.totalOutflow ?? 0, icon: ArrowDownCircle, color: 'text-red-500' },
                    { label: 'إجمالي الوارد', value: data?.totalIncome ?? 0, icon: ArrowUpCircle, color: 'text-emerald-500' },
                    { label: 'حالة المرتبات', value: data?.payrollStatus ?? 'لا يوجد', icon: Banknote, color: data?.payrollStatus === 'CLOSED' ? 'text-emerald-600' : 'text-amber-500', isText: true },
                ].map(({ label, value, icon: Icon, color, isText }) => (
                    <div key={label} className="rounded-2xl border border-sira-border bg-white p-5 flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sira-bg-subtle">
                            <Icon className={`h-5 w-5 ${color}`} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-wider">{label}</p>
                            <p className={`text-[15px] font-black tabular-nums ${color}`}>
                                {isText ? String(value) : `${fmt(value as number, lang)} ج.م`}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Payroll Tab ──────────────────────────────────────────────────────────────
function PayrollTab({ lang }: { lang: string }) {
    const [month, setMonth] = useState(currentMonth());
    const [run, setRun] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [closing, setClosing] = useState(false);
    const [closingId, setClosingId] = useState<number | null>(null);
    const [runs, setRuns] = useState<any[]>([]);

    const loadRun = useCallback(() => {
        setLoading(true);
        getPayrollRun(month).then(setRun).catch(() => setRun(null)).finally(() => setLoading(false));
    }, [month]);

    useEffect(() => {
        loadRun();
        listPayrollRuns().then(setRuns).catch(() => {});
    }, [loadRun]);

    const handleClose = async () => {
        if (!window.confirm(`إقفال مرتبات ${month}؟`)) return;
        setClosing(true);
        try {
            await closePayrollRun(month);
            toast.success('تم إقفال المرتبات');
            loadRun();
            listPayrollRuns().then(setRuns);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'فشل الإقفال');
        } finally { setClosing(false); }
    };

    const togglePaid = async (entryId: number, isPaid: boolean) => {
        setClosingId(entryId);
        try {
            await markPayrollEntryPaid(entryId, isPaid);
            setRun((prev: any) => prev ? {
                ...prev,
                entries: prev.entries.map((e: any) => e.id === entryId ? { ...e, isPaid, paidAt: isPaid ? new Date().toISOString() : null } : e),
            } : prev);
        } catch { toast.error('فشل تحديث الحالة'); }
        finally { setClosingId(null); }
    };

    const isClosed = run?.status === 'CLOSED';

    return (
        <div className="space-y-6" dir="rtl">
            <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex items-center gap-3">
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                        className="rounded-xl border border-sira-border bg-white px-3 py-2 text-[12px] font-bold text-sira-text-primary outline-none focus:border-sira-gold" />
                    {run && (
                        <span className={cn('px-3 py-1 rounded-xl text-[10px] font-black uppercase', isClosed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {isClosed ? 'مقفول' : 'مسودة'}
                        </span>
                    )}
                </div>
                {run && !isClosed && (
                    <button onClick={handleClose} disabled={closing}
                        className="flex items-center gap-2 rounded-2xl bg-sira-brown px-5 py-2.5 text-[11px] font-black text-white hover:bg-sira-brown-dark transition disabled:opacity-50">
                        {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        إقفال المرتبات
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sira-gold" /></div>
            ) : run ? (
                <>
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'إجمالي الأساسي', value: run.totalGross, color: 'text-sira-text-primary' },
                            { label: 'إجمالي الخصومات', value: run.totalDeductions, color: 'text-red-600' },
                            { label: 'إجمالي الصافي', value: run.totalNet, color: 'text-emerald-700' },
                        ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-2xl border border-sira-border bg-white p-5 text-center">
                                <p className="text-[10px] font-black uppercase text-sira-text-muted mb-2">{label}</p>
                                <p className={`text-xl font-black tabular-nums ${color}`}>{fmt(value, lang)} <span className="text-[11px]">ج.م</span></p>
                            </div>
                        ))}
                    </div>

                    {/* Entries table */}
                    <div className="overflow-hidden rounded-2xl border border-sira-border bg-white">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-[12px]">
                                <thead>
                                    <tr className="bg-sira-bg-subtle border-b border-sira-border text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                        <th className="px-4 py-3">الموظف</th>
                                        <th className="px-4 py-3">الدور</th>
                                        <th className="px-4 py-3">الأساسي</th>
                                        <th className="px-4 py-3">الخصومات</th>
                                        <th className="px-4 py-3">الصافي</th>
                                        <th className="px-4 py-3">مدفوع</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {run.entries.map((e: any) => (
                                        <tr key={e.id} className="border-b border-sira-border/50 last:border-0 hover:bg-sira-bg-subtle/50">
                                            <td className="px-4 py-3 font-bold text-sira-text-primary">{e.user?.firstName} {e.user?.lastName}</td>
                                            <td className="px-4 py-3 text-sira-text-muted">{e.user?.role?.displayName}</td>
                                            <td className="px-4 py-3 font-bold tabular-nums">{fmt(e.baseSalary, lang)} ج.م</td>
                                            <td className="px-4 py-3 text-red-600 font-bold tabular-nums">{e.deductions > 0 ? `-${fmt(e.deductions, lang)}` : '—'}</td>
                                            <td className="px-4 py-3 text-emerald-700 font-black tabular-nums">{fmt(e.netSalary, lang)} ج.م</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => togglePaid(e.id, !e.isPaid)}
                                                    disabled={closingId === e.id}
                                                    className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-black transition', e.isPaid ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}
                                                >
                                                    {closingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : e.isPaid ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    {e.isPaid ? 'مدفوع' : 'غير مدفوع'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-sira-bg-subtle font-black border-t-2 border-sira-border text-[11px]">
                                        <td colSpan={2} className="px-4 py-3">الإجمالي — {run.entries.length} موظف</td>
                                        <td className="px-4 py-3 tabular-nums">{fmt(run.totalGross, lang)} ج.م</td>
                                        <td className="px-4 py-3 text-red-600 tabular-nums">{fmt(run.totalDeductions, lang)} ج.م</td>
                                        <td className="px-4 py-3 text-emerald-700 tabular-nums">{fmt(run.totalNet, lang)} ج.م</td>
                                        <td className="px-4 py-3 text-emerald-600">{run.entries.filter((e: any) => e.isPaid).length} / {run.entries.length}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="text-center py-16 text-sira-text-muted text-sm">لا توجد بيانات</div>
            )}

            {/* History */}
            {runs.length > 1 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted">سجل الإقفالات</p>
                    <div className="grid gap-2">
                        {runs.filter((r) => r.month !== month).map((r) => (
                            <div key={r.id} className="flex items-center justify-between rounded-2xl border border-sira-border bg-white px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <Calendar className="h-4 w-4 text-sira-gold" />
                                    <span className="text-[12px] font-black text-sira-text-primary">{r.month}</span>
                                    <span className={cn('px-2 py-0.5 rounded-lg text-[9px] font-black uppercase', r.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{r.status === 'CLOSED' ? 'مقفول' : 'مسودة'}</span>
                                </div>
                                <div className="flex items-center gap-6 text-[12px] font-bold text-sira-text-muted">
                                    <span className="text-emerald-700">{fmt(r.totalNet, lang)} ج.م</span>
                                    <button onClick={() => setMonth(r.month)} className="text-sira-gold hover:underline text-[11px] font-black">عرض</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
const EXPENSE_CATS = ['بوفيه', 'إيجار', 'كهرباء', 'مياه', 'إنترنت', 'تسويق', 'صيانة', 'مواصلات', 'مستلزمات مكتبية', 'قسم المبيعات', 'قسم IT', 'قسم HR', 'أخرى'];
const INCOME_CATS = ['عمولات مبيعات', 'رسوم خدمات', 'إيراد تشغيلي', 'دفعات عملاء', 'أخرى'];

function TransactionsTab({ lang }: { lang: string }) {
    const [month, setMonth] = useState(currentMonth());
    const [txType, setTxType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ type: 'EXPENSE' as 'INCOME' | 'EXPENSE', category: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), department: '' });

    const load = useCallback(() => {
        setLoading(true);
        listFinanceTransactions(month, txType === 'ALL' ? undefined : txType)
            .then(setTransactions).catch(() => setTransactions([])).finally(() => setLoading(false));
    }, [month, txType]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.category || !form.amount) { toast.error('أدخل الفئة والمبلغ'); return; }
        setSaving(true);
        try {
            await createFinanceTransaction({ ...form, amount: Number(form.amount) });
            toast.success('تم الإضافة');
            setAddOpen(false);
            setForm({ type: 'EXPENSE', category: '', amount: '', description: '', date: new Date().toISOString().slice(0, 10), department: '' });
            load();
        } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل الإضافة'); }
        finally { setSaving(false); }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('حذف هذه المعاملة؟')) return;
        try { await deleteFinanceTransaction(id); load(); toast.success('تم الحذف'); }
        catch { toast.error('فشل الحذف'); }
    };

    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);

    const cats = form.type === 'INCOME' ? INCOME_CATS : EXPENSE_CATS;

    return (
        <div className="space-y-5" dir="rtl">
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                        className="rounded-xl border border-sira-border bg-white px-3 py-2 text-[12px] font-bold outline-none focus:border-sira-gold" />
                    <div className="flex rounded-xl border border-sira-border overflow-hidden">
                        {(['ALL', 'INCOME', 'EXPENSE'] as const).map(t => (
                            <button key={t} onClick={() => setTxType(t)} className={cn('px-3 py-2 text-[10px] font-black uppercase transition', txType === t ? 'bg-sira-brown text-white' : 'bg-white text-sira-text-muted hover:bg-sira-bg-subtle')}>
                                {t === 'ALL' ? 'الكل' : t === 'INCOME' ? 'إيرادات' : 'مصروفات'}
                            </button>
                        ))}
                    </div>
                </div>
                <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 rounded-2xl bg-sira-brown px-5 py-2.5 text-[11px] font-black text-white hover:bg-sira-brown-dark transition">
                    <Plus className="h-4 w-4" /> إضافة معاملة
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
                    <ArrowUpCircle className="h-6 w-6 text-emerald-600 shrink-0" />
                    <div><p className="text-[10px] font-black text-emerald-600 uppercase">إجمالي الإيرادات</p><p className="text-lg font-black text-emerald-700">{fmt(totalIncome, lang)} ج.م</p></div>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
                    <ArrowDownCircle className="h-6 w-6 text-red-600 shrink-0" />
                    <div><p className="text-[10px] font-black text-red-600 uppercase">إجمالي المصروفات</p><p className="text-lg font-black text-red-700">{fmt(totalExpense, lang)} ج.م</p></div>
                </div>
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-sira-gold" /></div> : (
                <div className="overflow-hidden rounded-2xl border border-sira-border bg-white">
                    {transactions.length === 0 ? (
                        <div className="py-16 text-center text-sira-text-muted text-sm">لا توجد معاملات لهذا الشهر</div>
                    ) : (
                        <table className="w-full text-right text-[12px]">
                            <thead>
                                <tr className="bg-sira-bg-subtle border-b border-sira-border text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                    <th className="px-4 py-3">التاريخ</th>
                                    <th className="px-4 py-3">النوع</th>
                                    <th className="px-4 py-3">الفئة</th>
                                    <th className="px-4 py-3">الوصف</th>
                                    <th className="px-4 py-3">القسم</th>
                                    <th className="px-4 py-3">المبلغ</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((t: any) => (
                                    <tr key={t.id} className="border-b border-sira-border/50 last:border-0 hover:bg-sira-bg-subtle/50">
                                        <td className="px-4 py-3 text-sira-text-muted">{new Date(t.date).toLocaleDateString('ar-EG')}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase', t.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                                                {t.type === 'INCOME' ? 'إيراد' : 'مصروف'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-bold">{t.category}</td>
                                        <td className="px-4 py-3 text-sira-text-muted max-w-[200px] truncate">{t.description || '—'}</td>
                                        <td className="px-4 py-3 text-sira-text-muted">{t.department || '—'}</td>
                                        <td className={cn('px-4 py-3 font-black tabular-nums', t.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700')}>
                                            {t.type === 'INCOME' ? '+' : '-'}{fmt(t.amount, lang)} ج.م
                                        </td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleDelete(t.id)} className="text-red-400 hover:text-red-600 transition"><Trash2 className="h-4 w-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="إضافة معاملة مالية" subtitle="مصروف أو إيراد" size="lg">
                <form onSubmit={handleAdd} className="space-y-4" dir="rtl">
                    <div className="flex gap-2">
                        {(['EXPENSE', 'INCOME'] as const).map(tp => (
                            <button key={tp} type="button" onClick={() => setForm(f => ({ ...f, type: tp, category: '' }))}
                                className={cn('flex-1 rounded-xl py-2.5 text-[11px] font-black transition', form.type === tp ? (tp === 'INCOME' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'bg-slate-100 text-slate-500')}>
                                {tp === 'INCOME' ? 'إيراد' : 'مصروف'}
                            </button>
                        ))}
                    </div>
                    <div>
                        <label className="modal-label">الفئة *</label>
                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="modal-input">
                            <option value="">اختر الفئة</option>
                            {cats.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="modal-label">المبلغ (ج.م) *</label>
                            <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="modal-input" placeholder="0" />
                        </div>
                        <div>
                            <label className="modal-label">التاريخ</label>
                            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="modal-input" />
                        </div>
                    </div>
                    <div>
                        <label className="modal-label">القسم (اختياري)</label>
                        <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="مثال: قسم المبيعات" className="modal-input" />
                    </div>
                    <div>
                        <label className="modal-label">الوصف (اختياري)</label>
                        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="modal-textarea" placeholder="تفاصيل المعاملة..." />
                    </div>
                    <div className="modal-actions-stack">
                        <button type="submit" disabled={saving} className="modal-btn-primary">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />} إضافة
                        </button>
                        <button type="button" onClick={() => setAddOpen(false)} className="modal-cancel-link">إلغاء</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

// ─── Fixed Bills Tab ──────────────────────────────────────────────────────────
function FixedBillsTab({ lang }: { lang: string }) {
    const [bills, setBills] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editBill, setEditBill] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', category: '', amount: '', dueDay: '1', notes: '' });

    const BILL_CATS = ['إيجار', 'كهرباء', 'مياه', 'إنترنت', 'هاتف', 'تأمين', 'اشتراكات', 'صيانة دورية', 'أخرى'];

    const load = () => {
        setLoading(true);
        listFixedBills().then(setBills).catch(() => setBills([])).finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const openEdit = (b: any) => {
        setEditBill(b);
        setForm({ name: b.name, category: b.category, amount: String(b.amount), dueDay: String(b.dueDay), notes: b.notes ?? '' });
        setAddOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name || !form.amount) { toast.error('أدخل الاسم والمبلغ'); return; }
        setSaving(true);
        try {
            if (editBill) {
                await updateFixedBill(editBill.id, { name: form.name, category: form.category, amount: Number(form.amount), dueDay: Number(form.dueDay), notes: form.notes || undefined });
                toast.success('تم التحديث');
            } else {
                await createFixedBill({ name: form.name, category: form.category, amount: Number(form.amount), dueDay: Number(form.dueDay), notes: form.notes || undefined });
                toast.success('تم الإضافة');
            }
            setAddOpen(false); setEditBill(null);
            setForm({ name: '', category: '', amount: '', dueDay: '1', notes: '' });
            load();
        } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل الحفظ'); }
        finally { setSaving(false); }
    };

    const handleToggle = async (b: any) => {
        try { await updateFixedBill(b.id, { isActive: !b.isActive }); load(); }
        catch { toast.error('فشل التحديث'); }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('حذف هذه الفاتورة؟')) return;
        try { await deleteFixedBill(id); load(); toast.success('تم الحذف'); }
        catch { toast.error('فشل الحذف'); }
    };

    const totalActive = bills.filter(b => b.isActive).reduce((s, b) => s + Number(b.amount), 0);

    return (
        <div className="space-y-5" dir="rtl">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase text-sira-text-muted">الفواتير الثابتة الشهرية</p>
                    <p className="text-lg font-black text-sira-text-primary">إجمالي نشط: {fmt(totalActive, lang)} ج.م / شهر</p>
                </div>
                <button onClick={() => { setEditBill(null); setForm({ name: '', category: '', amount: '', dueDay: '1', notes: '' }); setAddOpen(true); }}
                    className="flex items-center gap-2 rounded-2xl bg-sira-brown px-5 py-2.5 text-[11px] font-black text-white hover:bg-sira-brown-dark transition">
                    <Plus className="h-4 w-4" /> إضافة فاتورة
                </button>
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-sira-gold" /></div> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {bills.length === 0 ? (
                        <div className="col-span-full text-center py-16 text-sira-text-muted text-sm">لا توجد فواتير ثابتة</div>
                    ) : bills.map((b: any) => (
                        <div key={b.id} className={cn('rounded-2xl border p-5 transition', b.isActive ? 'border-sira-border bg-white' : 'border-dashed border-sira-border/50 bg-sira-bg-subtle opacity-60')}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-wider text-sira-gold">{b.category}</p>
                                    <p className="text-[14px] font-black text-sira-text-primary">{b.name}</p>
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => openEdit(b)} className="text-sira-text-muted hover:text-sira-brown transition"><Pencil className="h-3.5 w-3.5" /></button>
                                    <button onClick={() => handleDelete(b.id)} className="text-sira-text-muted hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                            </div>
                            <p className="text-xl font-black text-sira-text-primary tabular-nums">{fmt(Number(b.amount), lang)} <span className="text-[11px] text-sira-text-muted">ج.م</span></p>
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-[10px] font-bold text-sira-text-muted">يوم الاستحقاق: {b.dueDay}</span>
                                <button onClick={() => handleToggle(b)} className={cn('px-3 py-1 rounded-xl text-[9px] font-black transition', b.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                                    {b.isActive ? 'نشط' : 'موقوف'}
                                </button>
                            </div>
                            {b.notes && <p className="text-[10px] text-sira-text-muted mt-2 border-t border-sira-border/40 pt-2">{b.notes}</p>}
                        </div>
                    ))}
                </div>
            )}

            <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setEditBill(null); }} title={editBill ? 'تعديل فاتورة' : 'إضافة فاتورة ثابتة'} size="lg">
                <form onSubmit={handleSave} className="space-y-4" dir="rtl">
                    <div>
                        <label className="modal-label">اسم الفاتورة *</label>
                        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: إيجار المقر" className="modal-input" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="modal-label">الفئة</label>
                            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="modal-input">
                                <option value="">اختر</option>
                                {BILL_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="modal-label">يوم الاستحقاق</label>
                            <input type="number" min={1} max={31} value={form.dueDay} onChange={e => setForm(f => ({ ...f, dueDay: e.target.value }))} className="modal-input" />
                        </div>
                    </div>
                    <div>
                        <label className="modal-label">المبلغ الشهري (ج.م) *</label>
                        <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" className="modal-input" />
                    </div>
                    <div>
                        <label className="modal-label">ملاحظات (اختياري)</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="modal-textarea" />
                    </div>
                    <div className="modal-actions-stack">
                        <button type="submit" disabled={saving} className="modal-btn-primary">{saving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ</button>
                        <button type="button" onClick={() => { setAddOpen(false); setEditBill(null); }} className="modal-cancel-link">إلغاء</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

// ─── Commission Rates Tab ─────────────────────────────────────────────────────
function CommissionRatesTab() {
    const [rates, setRates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [editRate, setEditRate] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ developerName: '', companyRatePct: '', salesRatePct: '', taxRatePct: '0', notes: '' });

    const load = () => {
        setLoading(true);
        listCommissionRates().then(setRates).catch(() => setRates([])).finally(() => setLoading(false));
    };
    useEffect(() => { load(); }, []);

    const openAdd = () => { setEditRate(null); setForm({ developerName: '', companyRatePct: '', salesRatePct: '', taxRatePct: '0', notes: '' }); setAddOpen(true); };
    const openEdit = (r: any) => { setEditRate(r); setForm({ developerName: r.developerName, companyRatePct: String(r.companyRatePct), salesRatePct: String(r.salesRatePct), taxRatePct: String(r.taxRatePct), notes: r.notes ?? '' }); setAddOpen(true); };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.developerName || !form.companyRatePct || !form.salesRatePct) { toast.error('أدخل اسم المطور والنسب'); return; }
        setSaving(true);
        try {
            const body = { developerName: form.developerName, companyRatePct: Number(form.companyRatePct), salesRatePct: Number(form.salesRatePct), taxRatePct: Number(form.taxRatePct) || 0, notes: form.notes || undefined };
            if (editRate) { await updateCommissionRate(editRate.id, body); toast.success('تم التحديث'); }
            else { await createCommissionRate(body); toast.success('تم الإضافة'); }
            setAddOpen(false); setEditRate(null); load();
        } catch (e: any) { toast.error(e?.response?.data?.message || 'فشل الحفظ'); }
        finally { setSaving(false); }
    };

    const handleToggle = async (r: any) => {
        try { await updateCommissionRate(r.id, { isActive: !r.isActive }); load(); }
        catch { toast.error('فشل التحديث'); }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('حذف هذه المعدلة؟')) return;
        try { await deleteCommissionRate(id); load(); toast.success('تم الحذف'); }
        catch { toast.error('فشل الحذف'); }
    };

    return (
        <div className="space-y-5" dir="rtl">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sira-text-muted">معدلات العمولات</p>
                    <p className="text-sm font-bold text-sira-text-secondary mt-0.5">حدد نسبة الشركة والسيلز والضرايب لكل مطور</p>
                </div>
                <button onClick={openAdd} className="flex items-center gap-2 rounded-2xl bg-sira-brown px-5 py-2.5 text-[11px] font-black text-white hover:bg-sira-brown-dark transition">
                    <Plus className="h-4 w-4" /> إضافة معدلة
                </button>
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-sira-gold" /></div> : rates.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-sira-border py-16 text-center text-sira-text-muted text-sm">لا توجد معدلات — أضف معدلة لكل مطور</div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rates.map((r: any) => {
                        // Preview calculation on 1,000,000
                        const sample = 1_000_000;
                        const co = (sample * r.companyRatePct) / 100;
                        const sa = (co * r.salesRatePct) / 100;
                        const tax = (sa * r.taxRatePct) / 100;
                        return (
                            <div key={r.id} className={cn('rounded-2xl border p-5 transition', r.isActive ? 'border-sira-border bg-white' : 'border-dashed border-sira-border/40 bg-sira-bg-subtle opacity-60')}>
                                <div className="flex items-start justify-between gap-2 mb-4">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-sira-gold mb-1">مطور</p>
                                        <p className="text-[15px] font-black text-sira-text-primary">{r.developerName}</p>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button onClick={() => openEdit(r)} className="text-sira-text-muted hover:text-sira-brown transition"><Pencil className="h-3.5 w-3.5" /></button>
                                        <button onClick={() => handleDelete(r.id)} className="text-sira-text-muted hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {[
                                        { label: 'نسبة الشركة', value: r.companyRatePct, color: 'text-blue-700', bg: 'bg-blue-50' },
                                        { label: 'نسبة السيلز', value: r.salesRatePct, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                                        { label: 'الضرايب', value: r.taxRatePct, color: 'text-red-600', bg: 'bg-red-50' },
                                    ].map(({ label, value, color, bg }) => (
                                        <div key={label} className={`rounded-xl p-2 text-center ${bg}`}>
                                            <p className="text-[8px] font-black uppercase text-sira-text-muted">{label}</p>
                                            <p className={`text-[16px] font-black tabular-nums ${color}`}>{value}%</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="rounded-xl bg-sira-bg-subtle p-3 space-y-1 text-[11px]">
                                    <p className="text-[9px] font-black uppercase text-sira-text-muted tracking-wider mb-2">مثال على وحدة بـ 1,000,000 ج.م</p>
                                    <div className="flex justify-between font-bold text-sira-text-secondary">
                                        <span>حصة الشركة</span><span className="tabular-nums text-blue-700">{co.toLocaleString()} ج.م</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-sira-text-secondary">
                                        <span>حصة السيلز (إجمالي)</span><span className="tabular-nums text-emerald-700">{sa.toLocaleString()} ج.م</span>
                                    </div>
                                    {r.taxRatePct > 0 && <div className="flex justify-between font-bold text-sira-text-secondary">
                                        <span>الضريبة</span><span className="tabular-nums text-red-600">-{tax.toLocaleString()} ج.م</span>
                                    </div>}
                                    <div className="flex justify-between font-black border-t border-sira-border/40 pt-1 mt-1">
                                        <span>صافي السيلز</span><span className="tabular-nums text-sira-brown">{(sa - tax).toLocaleString()} ج.م</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-3">
                                    {r.notes && <p className="text-[10px] text-sira-text-muted truncate max-w-[60%]">{r.notes}</p>}
                                    <button onClick={() => handleToggle(r)} className={cn('ms-auto px-3 py-1 rounded-xl text-[9px] font-black transition', r.isActive ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                                        {r.isActive ? 'نشط' : 'موقوف'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal isOpen={addOpen} onClose={() => { setAddOpen(false); setEditRate(null); }} title={editRate ? 'تعديل معدلة عمولة' : 'إضافة معدلة عمولة'} size="lg">
                <form onSubmit={handleSave} className="space-y-5" dir="rtl">
                    <div>
                        <label className="modal-label">اسم المطور / الشركة *</label>
                        <input value={form.developerName} onChange={e => setForm(f => ({ ...f, developerName: e.target.value }))} placeholder="مثال: شركة المدينة للتطوير" className="modal-input" />
                    </div>

                    <div className="rounded-2xl border border-sira-border bg-sira-bg-subtle p-4 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sira-text-muted">النسب المئوية</p>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="modal-label">نسبة الشركة % *</label>
                                <p className="text-[9px] text-sira-text-muted mb-1">من سعر الوحدة</p>
                                <div className="relative">
                                    <input type="number" min="0" max="100" step="0.01" value={form.companyRatePct} onChange={e => setForm(f => ({ ...f, companyRatePct: e.target.value }))} placeholder="2.5" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className="modal-label">نسبة السيلز % *</label>
                                <p className="text-[9px] text-sira-text-muted mb-1">من حصة الشركة</p>
                                <div className="relative">
                                    <input type="number" min="0" max="100" step="0.01" value={form.salesRatePct} onChange={e => setForm(f => ({ ...f, salesRatePct: e.target.value }))} placeholder="30" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className="modal-label">الضرايب %</label>
                                <p className="text-[9px] text-sira-text-muted mb-1">من حصة السيلز</p>
                                <div className="relative">
                                    <input type="number" min="0" max="100" step="0.01" value={form.taxRatePct} onChange={e => setForm(f => ({ ...f, taxRatePct: e.target.value }))} placeholder="0" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* Live preview */}
                        {form.companyRatePct && form.salesRatePct && (
                            <div className="rounded-xl border border-sira-gold/30 bg-sira-gold/5 p-3 text-[11px]">
                                <p className="text-[9px] font-black uppercase text-sira-gold tracking-wider mb-2">معاينة على وحدة بـ 1,000,000 ج.م</p>
                                {(() => {
                                    const co = (1_000_000 * Number(form.companyRatePct)) / 100;
                                    const sa = (co * Number(form.salesRatePct)) / 100;
                                    const tax = (sa * Number(form.taxRatePct || 0)) / 100;
                                    return (
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div><p className="text-sira-text-muted">حصة الشركة</p><p className="font-black text-blue-700">{co.toLocaleString()} ج.م</p></div>
                                            <div><p className="text-sira-text-muted">إجمالي السيلز</p><p className="font-black text-emerald-700">{sa.toLocaleString()} ج.م</p></div>
                                            <div><p className="text-sira-text-muted">صافي بعد الضريبة</p><p className="font-black text-sira-brown">{(sa - tax).toLocaleString()} ج.م</p></div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="modal-label">ملاحظات (اختياري)</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="modal-textarea" placeholder="أي تفاصيل إضافية..." />
                    </div>

                    <div className="modal-actions-stack">
                        <button type="submit" disabled={saving} className="modal-btn-primary">{saving && <Loader2 className="h-4 w-4 animate-spin" />} {editRate ? 'تحديث' : 'إضافة'}</button>
                        <button type="button" onClick={() => { setAddOpen(false); setEditRate(null); }} className="modal-cancel-link">إلغاء</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

// ─── Sales Tab (existing functionality) ──────────────────────────────────────
function SalesTab() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState<FinanceEmployee[]>([]);
    const [deductOpen, setDeductOpen] = useState(false);
    const [deductUserId, setDeductUserId] = useState<string | number | null>(null);
    const [deductAmount, setDeductAmount] = useState('');
    const [deductReason, setDeductReason] = useState('');
    const [deductSaving, setDeductSaving] = useState(false);
    const [commOpen, setCommOpen] = useState(false);
    const [commUserId, setCommUserId] = useState<string | number | null>(null);
    const [commTitle, setCommTitle] = useState('');
    const [commSaleDate, setCommSaleDate] = useState('');
    const [commDueNote, setCommDueNote] = useState('');
    const [commSaving, setCommSaving] = useState(false);
    const [collectingId, setCollectingId] = useState<string | number | null>(null);

    // Rate-based commission state
    const [commRates, setCommRates] = useState<any[]>([]);
    const [selectedRateId, setSelectedRateId] = useState<number | null>(null);
    const [unitPrice, setUnitPrice] = useState('');
    const [commCompanyPct, setCommCompanyPct] = useState('');
    const [commSalesPct, setCommSalesPct] = useState('');
    const [commTaxPct, setCommTaxPct] = useState('0');

    const selectedRate = commRates.find(r => r.id === selectedRateId);

    // Auto-fill rates when developer is selected
    const handleRateSelect = (rateId: number) => {
        setSelectedRateId(rateId);
        const r = commRates.find(x => x.id === rateId);
        if (r) { setCommCompanyPct(String(r.companyRatePct)); setCommSalesPct(String(r.salesRatePct)); setCommTaxPct(String(r.taxRatePct)); }
    };

    // Live calculation
    const calcAmounts = () => {
        const price = Number(unitPrice) || 0;
        const co = (price * (Number(commCompanyPct) || 0)) / 100;
        const sa = (co * (Number(commSalesPct) || 0)) / 100;
        const tax = (sa * (Number(commTaxPct) || 0)) / 100;
        return { co, sa, tax, net: sa - tax };
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [d, rates] = await Promise.all([getFinanceSalesOverview(), listCommissionRates()]);
            setEmployees(d.employees ?? []);
            setCommRates(rates.filter((r: any) => r.isActive));
        }
        catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || '';
            toast.error(msg ? `فشل تحميل البيانات: ${msg}` : 'فشل تحميل بيانات المبيعات');
        }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCommModal = () => {
        setCommUserId(null); setCommTitle(''); setCommSaleDate(''); setCommDueNote('');
        setSelectedRateId(null); setUnitPrice(''); setCommCompanyPct(''); setCommSalesPct(''); setCommTaxPct('0');
        setCommOpen(true);
    };

    const submitDeduction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deductUserId || !deductAmount || !deductReason) { toast.error(t('finance.fillAllFields')); return; }
        setDeductSaving(true);
        try {
            await createFinanceDeduction({ userId: Number(deductUserId), amount: parseFloat(deductAmount), reason: deductReason });
            toast.success(t('finance.deductionAdded')); setDeductOpen(false); setDeductAmount(''); setDeductReason(''); load();
        } catch (err: any) { toast.error(err?.response?.data?.message || t('finance.errorDeduction')); }
        finally { setDeductSaving(false); }
    };

    const submitCommission = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!commUserId || !commTitle || !commSaleDate || !unitPrice || !commCompanyPct || !commSalesPct) {
            toast.error('أدخل الموظف، العنوان، التاريخ، سعر الوحدة، والنسب'); return;
        }
        setCommSaving(true);
        try {
            await createCommissionFromRate({
                userId: Number(commUserId),
                title: commTitle,
                saleDate: commSaleDate,
                unitPrice: Number(unitPrice),
                commissionRateId: selectedRateId ?? undefined,
                companyRatePct: Number(commCompanyPct),
                salesRatePct: Number(commSalesPct),
                taxRatePct: Number(commTaxPct) || 0,
                dueNote: commDueNote || undefined,
            });
            toast.success(t('finance.commissionAdded'));
            setCommOpen(false); load();
        } catch (err: any) { toast.error(err?.response?.data?.message || t('finance.errorCommission')); }
        finally { setCommSaving(false); }
    };

    const handleCollect = async (commId: string | number) => {
        setCollectingId(commId);
        try { await collectFinanceCommission(commId); toast.success(t('finance.commissionCollected')); load(); }
        catch (err: any) { toast.error(err?.response?.data?.message || t('finance.errorCollect')); }
        finally { setCollectingId(null); }
    };

    const totalBasic = employees.reduce((s, e) => s + e.basicSalary, 0);
    const totalDed = employees.reduce((s, e) => s + e.deductionsTotal, 0);
    const totalNet = employees.reduce((s, e) => s + e.netAfterDeductions, 0);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sira-gold" /></div>;

    return (
        <div className="space-y-6" dir="rtl">
            <div className="grid grid-cols-3 gap-4">
                {[{ label: 'إجمالي أساسي', v: totalBasic, c: '' }, { label: 'إجمالي خصومات', v: totalDed, c: 'text-red-600' }, { label: 'إجمالي صافي', v: totalNet, c: 'text-emerald-700' }].map(({ label, v, c }) => (
                    <div key={label} className="rounded-2xl border border-sira-border bg-white p-4 text-center">
                        <p className="text-[10px] font-black uppercase text-sira-text-muted mb-1">{label}</p>
                        <p className={`text-lg font-black tabular-nums ${c}`}>{formatFinanceMoney(v)}</p>
                    </div>
                ))}
            </div>

            <div className="flex gap-3 justify-end">
                <button onClick={() => setDeductOpen(true)} className="flex items-center gap-2 rounded-2xl border border-sira-border bg-white px-4 py-2.5 text-[11px] font-black text-sira-text-primary hover:bg-sira-bg-subtle transition">
                    <Plus className="h-4 w-4 text-red-500" /> {t('finance.addDeduction')}
                </button>
                <button onClick={openCommModal} className="flex items-center gap-2 rounded-2xl bg-sira-brown px-4 py-2.5 text-[11px] font-black text-white hover:bg-sira-brown-dark transition">
                    <Plus className="h-4 w-4" /> {t('finance.addCommission')}
                </button>
            </div>

            <div className="space-y-4">
                {employees.map((emp) => (
                    <div key={String(emp.id)} className="rounded-2xl border border-sira-border bg-white overflow-hidden">
                        <div className="flex items-center gap-4 p-4 border-b border-sira-border/50">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sira-bg-subtle font-black text-sm text-sira-brown">
                                {emp.firstName[0]}{emp.lastName[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-sira-text-primary">{emp.firstName} {emp.lastName}</p>
                                {emp.team && <p className="text-[10px] text-sira-text-muted font-bold">{emp.team.name}</p>}
                            </div>
                            <div className="flex items-center gap-6 text-[12px]">
                                <div className="text-center"><p className="text-[9px] font-black text-sira-text-muted uppercase">أساسي</p><p className="font-black">{formatFinanceMoney(emp.basicSalary)}</p></div>
                                <div className="text-center"><p className="text-[9px] font-black text-red-500 uppercase">خصومات</p><p className="font-black text-red-600">{formatFinanceMoney(emp.deductionsTotal)}</p></div>
                                <div className="text-center"><p className="text-[9px] font-black text-emerald-600 uppercase">صافي</p><p className="font-black text-emerald-700">{formatFinanceMoney(emp.netAfterDeductions)}</p></div>
                            </div>
                            <Link to={`/finance/${emp.id}`} className="text-sira-gold hover:text-sira-brown transition">
                                <PanelRightOpen className="h-5 w-5" />
                            </Link>
                        </div>
                        {emp.commissions.filter(c => c.status === 'pending_collection').length > 0 && (
                            <div className="px-4 py-3 flex flex-wrap gap-2">
                                {emp.commissions.filter(c => c.status === 'pending_collection').map((c) => (
                                    <div key={String(c.id)} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                        <span className="text-[11px] font-bold text-amber-800">{c.title}</span>
                                        {c.amount != null && <span className="text-[11px] font-black text-amber-700">{formatFinanceMoney(c.amount)}</span>}
                                        <button onClick={() => handleCollect(c.id)} disabled={collectingId === c.id}
                                            className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[9px] font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                                            {collectingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                            {t('finance.collect')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Deduction Modal */}
            <Modal isOpen={deductOpen} onClose={() => setDeductOpen(false)} title={t('finance.addDeduction')} size="md">
                <form onSubmit={submitDeduction} className="space-y-4" dir="rtl">
                    <div><label className="modal-label">{t('finance.employee')}</label>
                        <select value={deductUserId ?? ''} onChange={e => setDeductUserId(e.target.value)} className="modal-input">
                            <option value="">اختر موظف</option>
                            {employees.map(e => <option key={String(e.id)} value={String(e.id)}>{e.firstName} {e.lastName}</option>)}
                        </select>
                    </div>
                    <div><label className="modal-label">{t('finance.amount')}</label>
                        <input type="number" min="1" step="0.01" value={deductAmount} onChange={e => setDeductAmount(e.target.value)} className="modal-input" /></div>
                    <div><label className="modal-label">{t('finance.reason')}</label>
                        <input value={deductReason} onChange={e => setDeductReason(e.target.value)} className="modal-input" /></div>
                    <div className="modal-actions-stack">
                        <button type="submit" disabled={deductSaving} className="modal-btn-primary">{deductSaving && <Loader2 className="h-4 w-4 animate-spin" />} {t('finance.save')}</button>
                        <button type="button" onClick={() => setDeductOpen(false)} className="modal-cancel-link">{t('common.cancel')}</button>
                    </div>
                </form>
            </Modal>

            {/* Commission Modal — Rate Based */}
            <Modal isOpen={commOpen} onClose={() => setCommOpen(false)} title="إضافة عمولة" subtitle="محسوبة من نسب المطور" size="xl">
                <form onSubmit={submitCommission} className="space-y-5" dir="rtl">
                    {/* Employee + Title */}
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="modal-label">الموظف *</label>
                            <select value={commUserId ?? ''} onChange={e => setCommUserId(e.target.value)} className="modal-input">
                                <option value="">اختر موظف</option>
                                {employees.map(e => <option key={String(e.id)} value={String(e.id)}>{e.firstName} {e.lastName}</option>)}
                            </select></div>
                        <div><label className="modal-label">تاريخ البيع *</label>
                            <input type="date" value={commSaleDate} onChange={e => setCommSaleDate(e.target.value)} className="modal-input" /></div>
                    </div>
                    <div><label className="modal-label">عنوان الوحدة *</label>
                        <input value={commTitle} onChange={e => setCommTitle(e.target.value)} placeholder="مثال: شقة 3 غرف — مشروع X" className="modal-input" /></div>

                    {/* Developer / Rate selection */}
                    <div className="rounded-2xl border border-sira-border bg-sira-bg-subtle p-4 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sira-text-muted">المطور والنسب</p>
                        <div>
                            <label className="modal-label">اختر مطور (اختياري — يملأ النسب تلقائياً)</label>
                            <select value={selectedRateId ?? ''} onChange={e => handleRateSelect(Number(e.target.value))} className="modal-input">
                                <option value="">اختر مطور أو أدخل النسب يدوياً</option>
                                {commRates.map(r => <option key={r.id} value={r.id}>{r.developerName} — {r.companyRatePct}% شركة / {r.salesRatePct}% سيلز</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="modal-label">سعر الوحدة (ج.م) *</label>
                                <input type="number" min="0" step="1" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="مثال: 2500000" className="modal-input" /></div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="modal-label">نسبة الشركة % *</label>
                                <div className="relative"><input type="number" min="0" max="100" step="0.01" value={commCompanyPct} onChange={e => setCommCompanyPct(e.target.value)} placeholder="2.5" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" /></div>
                            </div>
                            <div>
                                <label className="modal-label">نسبة السيلز % *</label>
                                <div className="relative"><input type="number" min="0" max="100" step="0.01" value={commSalesPct} onChange={e => setCommSalesPct(e.target.value)} placeholder="30" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" /></div>
                            </div>
                            <div>
                                <label className="modal-label">الضرايب %</label>
                                <div className="relative"><input type="number" min="0" max="100" step="0.01" value={commTaxPct} onChange={e => setCommTaxPct(e.target.value)} placeholder="0" className="modal-input pe-8" />
                                    <Percent className="absolute top-1/2 -translate-y-1/2 end-2.5 h-3.5 w-3.5 text-sira-text-muted pointer-events-none" /></div>
                            </div>
                        </div>

                        {/* Live calculation */}
                        {unitPrice && commCompanyPct && commSalesPct && (() => {
                            const { co, sa, tax, net } = calcAmounts();
                            return (
                                <div className="rounded-xl border border-sira-gold/30 bg-sira-gold/5 p-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-sira-gold mb-3">الحساب التلقائي</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-[11px]">
                                        <div className="rounded-xl bg-blue-50 p-2"><p className="text-sira-text-muted text-[9px]">حصة الشركة</p><p className="font-black text-blue-700 tabular-nums">{co.toLocaleString()} ج.م</p></div>
                                        <div className="rounded-xl bg-emerald-50 p-2"><p className="text-sira-text-muted text-[9px]">إجمالي السيلز</p><p className="font-black text-emerald-700 tabular-nums">{sa.toLocaleString()} ج.م</p></div>
                                        <div className="rounded-xl bg-red-50 p-2"><p className="text-sira-text-muted text-[9px]">الضريبة</p><p className="font-black text-red-600 tabular-nums">-{tax.toLocaleString()} ج.م</p></div>
                                        <div className="rounded-xl bg-sira-brown/10 p-2 border border-sira-brown/20"><p className="text-sira-text-muted text-[9px]">صافي السيلز</p><p className="font-black text-sira-brown tabular-nums">{net.toLocaleString()} ج.م</p></div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div><label className="modal-label">ملاحظات (اختياري)</label>
                        <textarea value={commDueNote} onChange={e => setCommDueNote(e.target.value)} rows={2} className="modal-textarea" placeholder="أي تفاصيل..." /></div>

                    <div className="modal-actions-stack">
                        <button type="submit" disabled={commSaving} className="modal-btn-primary">{commSaving && <Loader2 className="h-4 w-4 animate-spin" />} حفظ العمولة</button>
                        <button type="button" onClick={() => setCommOpen(false)} className="modal-cancel-link">{t('common.cancel')}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const canAccess = (FINANCE_ROLES as readonly string[]).includes(roleName);
    const lang = i18n.language;

    const [tab, setTab] = useState<Tab>('dashboard');

    useEffect(() => {
        if (user && !canAccess) navigate('/dashboard', { replace: true });
    }, [user, canAccess, navigate]);

    if (!canAccess) return null;

    const tabs: { id: Tab; label: string; icon: any }[] = [
        { id: 'dashboard', label: 'لوحة المالية', icon: LayoutDashboard },
        { id: 'payroll', label: 'المرتبات', icon: Banknote },
        { id: 'transactions', label: 'المصروفات والإيرادات', icon: Receipt },
        { id: 'fixed-bills', label: 'الفواتير الثابتة', icon: CreditCard },
        { id: 'commission-rates', label: 'معدلات العمولات', icon: Percent },
        { id: 'sales', label: 'فريق المبيعات', icon: TrendingUp },
    ];

    return (
        <div className="min-h-screen bg-sira-bg-page p-4 md:p-8 space-y-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sira-gold text-white shadow-lg shadow-sira-gold/30">
                    <Wallet className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sira-text-muted">إدارة مالية</p>
                    <h1 className="text-2xl font-black text-sira-text-primary">الفايننس</h1>
                </div>
            </div>

            {/* Tabs */}
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {tabs.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setTab(id)} className={cn(
                        'shrink-0 flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-[11px] font-black transition-all',
                        tab === id ? 'border-sira-gold bg-sira-brown text-white shadow-lg' : 'border-sira-border bg-white text-sira-text-primary hover:border-sira-gold/40',
                    )}>
                        <Icon className={cn('h-4 w-4', tab === id ? 'text-sira-gold' : 'text-sira-text-muted')} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="min-h-[400px]">
                {tab === 'dashboard' && <DashboardTab lang={lang} />}
                {tab === 'payroll' && <PayrollTab lang={lang} />}
                {tab === 'transactions' && <TransactionsTab lang={lang} />}
                {tab === 'fixed-bills' && <FixedBillsTab lang={lang} />}
                {tab === 'commission-rates' && <CommissionRatesTab />}
                {tab === 'sales' && <SalesTab />}
            </div>
        </div>
    );
}
