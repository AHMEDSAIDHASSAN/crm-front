import {
    Users,
    Megaphone,
    CheckCircle2,
    Clock,
    BarChart3,
    TrendingUp,
    Loader2,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import { useTranslation } from 'react-i18next';
import { toast } from '../lib/toast';
import { isSalesUser } from '../lib/userRole';

type FleetRow = { id: string; name: string; load: number; conversionPct: number };

export default function Dashboard() {
    const { t, i18n } = useTranslation();
    const user = useSelector((state: any) => state.user.user);
    const isSales = isSalesUser(user);
    const isRtl = i18n.language?.toLowerCase().startsWith('ar');
    const [dash, setDash] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const dashData = await getDashboardStats().catch(() => ({}));
                if (!cancelled) setDash(dashData && typeof dashData === 'object' ? dashData : {});
            } catch {
                if (!cancelled) setDash({});
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const kpis = useMemo(() => {
        const d = dash ?? {};
        const summary = d.summary ?? {};
        return {
            agents: typeof d.kpis?.agents === 'number' ? d.kpis.agents : 0,
            campaigns: typeof d.kpis?.campaigns === 'number' ? d.kpis.campaigns : 0,
            leads: typeof d.kpis?.leads === 'number' ? d.kpis.leads : Number(summary.totalLeads) || 0,
            meetings: typeof d.kpis?.meetings === 'number' ? d.kpis.meetings : Number(summary.totalMeetings) || 0,
        };
    }, [dash]);

    const agentFleet: FleetRow[] = useMemo(() => {
        const raw = dash?.agentFleet;
        if (!Array.isArray(raw)) return [];
        return raw.map((r: any) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? '—'),
            load: Number(r.load) || 0,
            conversionPct: typeof r.conversionPct === 'number' ? r.conversionPct : Number(r.conversionPct) || 0,
        }));
    }, [dash]);

    const kpiTiles = useMemo(() => {
        const all = [
            {
                title: t('dashboard.kpiAgents'),
                value: kpis.agents,
                Icon: Users,
                link: '/brokerage/agents',
                box: 'bg-blue-50 text-blue-600',
                salesHidden: true,
            },
            {
                title: t('dashboard.kpiCampaigns'),
                value: kpis.campaigns,
                Icon: Megaphone,
                link: '/campaigns',
                box: 'bg-rose-50 text-rose-600',
                salesHidden: true,
            },
            {
                title: t('dashboard.kpiNewLeads'),
                value: kpis.leads,
                Icon: CheckCircle2,
                link: '/leads',
                box: 'bg-[#0B1828] text-white',
                salesHidden: false,
            },
            {
                title: t('dashboard.kpiMeetings'),
                value: kpis.meetings,
                Icon: Clock,
                link: '/meetings',
                box: 'bg-amber-50 text-amber-600',
                salesHidden: false,
            },
        ] as const;
        const list = isSales ? all.filter((x) => !x.salesHidden) : [...all];
        return list.map(({ salesHidden: _, ...kpi }) => kpi);
    }, [isSales, kpis.agents, kpis.campaigns, kpis.leads, kpis.meetings, t]);

    if (loading) {
        return (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-[#0B1828]/50">
                <Loader2 className="h-10 w-10 animate-spin text-[#BF9B30]" />
                <p className="text-[12px] font-black uppercase tracking-widest">{t('dashboard.loading')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-10 p-4 md:p-8" dir={isRtl ? 'rtl' : 'ltr'}>
            <div
                className={
                    isSales
                        ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6'
                        : 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4'
                }
            >
                {kpiTiles.map((kpi) => (
                    <Link
                        key={kpi.title}
                        to={kpi.link}
                        className="group overflow-hidden rounded-[2rem] border border-slate-50 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl md:rounded-[2.5rem] md:p-8"
                    >
                        <div
                            className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl text-xl font-bold shadow-sm md:mb-6 md:h-12 md:w-12 md:rounded-2xl ${kpi.box}`}
                        >
                            <kpi.Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.5} aria-hidden />
                        </div>
                        <h2 className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{kpi.title}</h2>
                        <p className="text-2xl font-black text-[#0B1828] md:text-3xl tabular-nums">
                            {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                        </p>
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-1 items-start gap-6 md:gap-8 lg:grid-cols-3">
                <div className={isSales ? 'space-y-6 md:space-y-8 lg:col-span-3' : 'space-y-6 md:space-y-8 lg:col-span-2'}>
                    <div className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0B1828] p-8 shadow-2xl md:p-10">
                        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="mb-2 text-2xl font-black text-white md:text-3xl">
                                    {t('dashboard.heroTitle')}, {user?.firstName ?? 'SIRA'}!
                                </h2>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                    {t('dashboard.heroSubtitle')}
                                </p>
                            </div>
                            <Link
                                to="/meetings"
                                className="mt-2 inline-flex shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-white/20 sm:mt-0"
                            >
                                {t('dashboard.openMeetings')}
                            </Link>
                        </div>
                        <div
                            className="pointer-events-none absolute end-0 top-0 p-8 opacity-10 md:p-10"
                            aria-hidden
                        >
                            <BarChart3 className="h-32 w-32 text-white md:h-40 md:w-40" strokeWidth={1} />
                        </div>
                    </div>

                    {!isSales && (
                        <div className="rounded-[2rem] border border-slate-50 bg-white p-6 shadow-sm md:rounded-[2.5rem] md:p-10">
                            <div className="mb-6 flex flex-col gap-1 sm:mb-8">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    {t('dashboard.salesActivityEyebrow')}
                                </p>
                                <h3 className="text-lg font-black text-[#0B1828] md:text-xl">{t('dashboard.salesActivityTitle')}</h3>
                            </div>
                            <div className="space-y-3 md:space-y-4">
                                {agentFleet.length === 0 ? (
                                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                                        {t('dashboard.noSalesFleet')}
                                    </p>
                                ) : (
                                    agentFleet.map((row) => (
                                        <Link
                                            key={row.id}
                                            to={`/personnel/${row.id}`}
                                            className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4 transition hover:bg-slate-100/90 md:p-5"
                                        >
                                            <div className="flex min-w-0 items-center gap-4">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-[#0B1828] shadow-sm">
                                                    {(row.name?.[0] || 'A').toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-[#0B1828]">{row.name}</p>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                        {t('dashboard.workloadLeads')}: {row.load.toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-end">
                                                <p className="text-sm font-black text-emerald-600 tabular-nums">{row.conversionPct}%</p>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                    {t('dashboard.purchaseRate')}
                                                </p>
                                            </div>
                                        </Link>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {!isSales && (
                    <div className="space-y-6 md:space-y-8">
                        <div className="rounded-[2rem] border border-slate-50 bg-white p-8 text-center shadow-sm md:rounded-[2.5rem] md:p-10">
                            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600 shadow-sm">
                                <TrendingUp className="h-9 w-9" strokeWidth={2.2} aria-hidden />
                            </div>
                            <h3 className="mb-2 text-xl font-black text-[#0B1828]">{t('dashboard.monthlyReports')}</h3>
                            <p className="mb-8 text-xs font-bold leading-relaxed text-slate-400">{t('dashboard.reportsDesc')}</p>
                            <button
                                type="button"
                                className="w-full rounded-2xl bg-[#0B1828] py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/20 transition hover:bg-slate-800"
                                onClick={() => toast.info(t('dashboard.pdfComingSoon'))}
                            >
                                {t('dashboard.downloadPdf')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
