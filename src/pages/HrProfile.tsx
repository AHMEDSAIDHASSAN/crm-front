import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    Loader2,
    Calendar,
    HandCoins,
    Banknote,
    Clock,
    TrendingUp,
    User,
    Building2,
    Clock3,
    CheckCircle2,
    MapPin,
    AlertTriangle,
} from 'lucide-react';
import { getHrEmployeeProfile } from '../services/api';
import { toast } from '../lib/toast';
import { formatMoney } from '../lib/currency';

function parseCoords(val: unknown): { lat: number; lng: number } | null {
    if (!val || typeof val !== 'string') return null;
    const parts = val.split(',').map((p) => Number(p.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return { lat: parts[0], lng: parts[1] };
    }
    return null;
}

export default function HrProfile() {
    const { userId } = useParams<{ userId: string }>();
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const lang = i18n.language;

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 7)); // Current month YYYY-MM

    const load = useCallback(async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const res = await getHrEmployeeProfile(userId);
            setData(res);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to load HR profile');
            navigate(-1);
        } finally {
            setLoading(false);
        }
    }, [userId, navigate]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading || !data) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sira-text-muted">
                <Loader2 className="h-8 w-8 animate-spin text-sira-gold" />
                <span className="text-sm font-semibold">{t('hrModule.loading')}</span>
            </div>
        );
    }

    const { user, stats, attendance, deductions, commissions } = data;

    // Filter attendance by selected month
    const filteredAttendance = attendance.filter((a: any) => a.checkInTime.startsWith(selectedDate));

    return (
        <div className="mx-auto max-w-6xl space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 rounded-xl border border-sira-border bg-sira-bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('salesProfile.back')}
                </button>
            </div>

            <div className="relative overflow-hidden rounded-[32px] border border-sira-border bg-gradient-to-br from-card via-card to-muted/50 p-8 shadow-lg shadow-black/5 ring-1 ring-border/60 dark:from-[#1E1E1E] dark:via-[#1a1a1a] dark:to-[#121212]">
                <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-sira-gold/10 blur-[100px] -mr-10 -mt-10" />
                <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-5">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-secondary/30 bg-sira-gold/10">
                            <User className="h-8 w-8 text-sira-gold" />
                        </div>
                        <div>
                            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.3em] text-sira-gold">
                                {t('hrModule.tabPayroll')} Profile
                            </p>
                            <h1 className="text-3xl font-black italic tracking-tight text-foreground">
                                {user.firstName} {user.lastName}
                            </h1>
                            <p className="mt-1 text-sm text-sira-text-muted">{user.email}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {user.title && (
                                    <span className="inline-flex items-center rounded-lg border border-sira-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-foreground/80">
                                        {user.title}
                                    </span>
                                )}
                                {user.team?.name && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-sira-border bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-foreground/80">
                                        <Building2 className="h-3.5 w-3.5" />
                                        {user.team.name}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/30 bg-sira-gold/10 px-2.5 py-1 text-[11px] font-bold text-sira-gold">
                                    <Banknote className="h-3.5 w-3.5" />
                                    {formatMoney(user.salary, lang)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {[
                    { label: t('hrModule.colLate'), value: stats.lateCount, tone: 'amber' as const, icon: Clock3 },
                    { label: t('hrModule.colDeduction'), value: formatMoney(stats.deductionsTotal, lang), tone: 'red' as const, icon: HandCoins },
                    { label: t('hrModule.colNetSalary'), value: formatMoney(stats.netAfterDeductions, lang), tone: 'emerald' as const, icon: Banknote },
                    { label: 'Pending Comm', value: stats.commissionsPendingCount, tone: 'amber' as const, icon: TrendingUp },
                    { label: 'Collected Comm', value: stats.commissionsCollectedCount, tone: 'emerald' as const, icon: CheckCircle2 },
                ].map((card, idx) => (
                    <div
                        key={idx}
                        className={`rounded-2xl border p-5 shadow-sm ${
                            card.tone === 'amber'
                                ? 'border-amber-500/20 bg-amber-500/5'
                                : card.tone === 'red'
                                  ? 'border-red-500/20 bg-red-500/5'
                                  : card.tone === 'emerald'
                                    ? 'border-emerald-500/20 bg-emerald-500/5'
                                    : 'border-sira-border bg-sira-bg-card'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-wider text-sira-text-muted">{card.label}</p>
                            <card.icon className={`h-4 w-4 ${
                                card.tone === 'amber' ? 'text-amber-500' : 
                                card.tone === 'red' ? 'text-red-500' : 
                                card.tone === 'emerald' ? 'text-emerald-500' : 'text-sira-text-muted'
                            }`} />
                        </div>
                        <p className={`mt-2 text-xl font-black tabular-nums tracking-tight ${
                            card.tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 
                            card.tone === 'red' ? 'text-red-600 dark:text-red-400' : 
                            card.tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                        }`}>
                            {card.value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {/* Attendance History */}
                <section className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-sira-gold" />
                            <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                                {t('hrModule.tabAttendance')}
                            </h2>
                        </div>
                        <input
                            type="month"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="rounded-xl border border-sira-border bg-sira-bg-card px-3 py-1.5 text-xs font-bold text-foreground focus:outline-none"
                        />
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-sira-border bg-sira-bg-card shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-sira-border bg-muted/50 text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">{t('hrModule.colCheckIn')}</th>
                                        <th className="px-4 py-3">{t('hrModule.colCheckOut')}</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Location</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAttendance.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-xs text-sira-text-muted">
                                                No attendance records for this month.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAttendance.map((a: any) => {
                                            const ciCoords = parseCoords(a.checkInLocation);
                                            const coCoords = parseCoords(a.checkOutLocation);
                                            return (
                                                <tr key={a.id} className="border-b border-sira-border/60 last:border-0 hover:bg-muted/30">
                                                    <td className="px-4 py-3 font-medium">{new Date(a.checkInTime).toLocaleDateString()}</td>
                                                    <td className="px-4 py-3 text-emerald-500 font-bold">{new Date(a.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                    <td className="px-4 py-3 text-red-500 font-bold">
                                                        {a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : t('hrModule.pending')}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {a.isLate ? (
                                                            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                LATE {a.lateMinutes ? `(${a.lateMinutes}m)` : ''}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                ON TIME
                                                            </span>
                                                        )}
                                                        {a.penaltyAmount > 0 && (
                                                            <span className="ms-1 inline-flex items-center rounded-lg bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-500">
                                                                -{Number(a.penaltyAmount).toFixed(0)} EGP
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1">
                                                            {ciCoords && (
                                                                <a href={`https://www.google.com/maps/search/?api=1&query=${ciCoords.lat},${ciCoords.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:underline">
                                                                    <MapPin className="h-3 w-3" /> In
                                                                </a>
                                                            )}
                                                            {coCoords && (
                                                                <a href={`https://www.google.com/maps/search/?api=1&query=${coCoords.lat},${coCoords.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500 hover:underline">
                                                                    <MapPin className="h-3 w-3" /> Out
                                                                </a>
                                                            )}
                                                            {!ciCoords && !coCoords && <span className="text-[10px] text-sira-text-muted">—</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* Deductions History */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <HandCoins className="h-5 w-5 text-red-500" />
                        <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                            {t('finance.deductions')}
                        </h2>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-sira-border bg-sira-bg-card shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-sira-border bg-muted/50 text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Amount</th>
                                        <th className="px-4 py-3">Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {deductions.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="p-8 text-center text-xs text-sira-text-muted">
                                                No deductions history.
                                            </td>
                                        </tr>
                                    ) : (
                                        deductions.map((d: any) => (
                                            <tr key={d.id} className="border-b border-sira-border/60 last:border-0 hover:bg-muted/30">
                                                <td className="px-4 py-3 text-sira-text-muted">{new Date(d.createdAt).toLocaleDateString()}</td>
                                                <td className="px-4 py-3 font-bold text-red-600">{formatMoney(d.amount, lang)}</td>
                                                <td className="px-4 py-3 text-xs">{d.reason}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>

            {/* Commissions Section */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-emerald-500" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
                        Commissions
                    </h2>
                </div>
                <div className="overflow-hidden rounded-2xl border border-sira-border bg-sira-bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-sira-border bg-muted/50 text-[10px] font-black uppercase tracking-wider text-sira-text-muted">
                                    <th className="px-4 py-3">Title</th>
                                    <th className="px-4 py-3">Sale Date</th>
                                    <th className="px-4 py-3">Amount</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Collected At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {commissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-xs text-sira-text-muted">
                                            No commissions history.
                                        </td>
                                    </tr>
                                ) : (
                                    commissions.map((c: any) => (
                                        <tr key={c.id} className="border-b border-sira-border/60 last:border-0 hover:bg-muted/30">
                                            <td className="px-4 py-3 font-semibold text-foreground">{c.title}</td>
                                            <td className="px-4 py-3 text-sira-text-muted">{new Date(c.saleDate).toLocaleDateString()}</td>
                                            <td className="px-4 py-3 font-bold text-foreground">{c.amount != null ? formatMoney(c.amount, lang) : '—'}</td>
                                            <td className="px-4 py-3">
                                                {c.status === 'collected' ? (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-100/80 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-900">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Collected
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-black uppercase text-amber-900">
                                                        <Clock className="h-3 w-3" />
                                                        Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-sira-text-muted">
                                                {c.collectedAt ? new Date(c.collectedAt).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}

