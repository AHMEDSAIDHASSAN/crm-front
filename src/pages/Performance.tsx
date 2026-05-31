import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, BarChart3, Building2, UserCircle2, Users, ArrowUpRight, PieChart } from 'lucide-react';
import { translateLeadStatus } from '../lib/leadStatusLabel';
import { leadStatusBadgeClass } from '../lib/siraStyles';
import { getPerformanceOverview } from '../services/api';
import { toast } from '../lib/toast';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/Store';
import { useTranslation } from 'react-i18next';
import { getCanonicalRoleName } from '../lib/userRole';
import { cn } from '../lib/utils';
import { getRoleDisplayName } from '../lib/userRole';

type Row = {
    userId: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    role?: { name?: string; displayName?: string | null };
    team?: { id?: string; name?: string | null } | null;
    assignedLeads: number;
    assignedLeadsTotal?: number;
    leadsByStatus?: Record<string, number>;
    convertedLeads: number;
    meetingsTotal: number;
    meetingsCompleted: number;
    meetingsOpen: number;
    salesWeek?: number;
    salesMonth?: number;
    conversionRate: number;
};

type TeamOption = { id: string; name: string };

const ALL_TEAMS = 'all';
const ALL_MEMBERS = 'all';
const KPI_WEIGHTS = {
    conversionRate: 0.35,
    meetingCompletionRate: 0.25,
    salesImpact: 0.25,
    leadCoverage: 0.15,
} as const;

function roleLabel(r: Row) {
    return getRoleDisplayName(r.role) || '—';
}

function personLabel(r: Row) {
    const n = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
    return n || r.email || `User ${r.userId}`;
}

function formatStatusLabel(status: string) {
    return String(status || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Performance() {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language?.toLowerCase().startsWith('ar');
    const currentUser = useSelector((state: RootState) => state.user.user);
    const roleName = getCanonicalRoleName(currentUser);
    const isSales = roleName === 'sales';

    const [rows, setRows] = useState<Row[]>([]);
    const [teams, setTeams] = useState<TeamOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [teamValue, setTeamValue] = useState<string>(ALL_TEAMS);
    const [memberValue, setMemberValue] = useState<string>(ALL_MEMBERS);
    const filterDefaultsApplied = useRef(false);

    /** Only global roles see every team + "All teams"; others use API-scoped team list only */
    const canPickAllTeams = ['super_admin', 'operation_manager'].includes(roleName);
    const isTechLead = roleName === 'tech_lead';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const data = await getPerformanceOverview();
                const list = Array.isArray(data?.rows) ? data.rows : [];
                const teamList: TeamOption[] = Array.isArray(data?.teams)
                    ? data.teams.map((t: { id: string; name: string }) => ({
                          id: String(t.id),
                          name: t.name || `Team ${t.id}`,
                      }))
                    : [];
                if (!cancelled) {
                    setRows(list);
                    setTeams(teamList);
                }
            } catch {
                if (!cancelled) {
                    setRows([]);
                    setTeams([]);
                    toast.error(t('performance.couldNotLoad'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    /** Default team filter once (avoids resetting after user changes filters) */
    useEffect(() => {
        if (loading || filterDefaultsApplied.current) return;
        if (isTechLead && !currentUser) return;

        if (teams.length === 0) {
            filterDefaultsApplied.current = true;
            return;
        }

        if (canPickAllTeams) {
            setTeamValue(ALL_TEAMS);
            filterDefaultsApplied.current = true;
            return;
        }

        if (isTechLead) {
            const mine = currentUser?.teamId != null ? String(currentUser.teamId) : null;
            const mineOk = mine && teams.some((t) => t.id === mine);
            setTeamValue(mineOk ? mine! : teams[0]!.id);
            filterDefaultsApplied.current = true;
            return;
        }

        const mine = currentUser?.teamId != null ? String(currentUser.teamId) : null;
        const mineOk = mine && teams.some((t) => t.id === mine);
        setTeamValue(mineOk ? mine! : teams[0]!.id);
        filterDefaultsApplied.current = true;
    }, [loading, teams, canPickAllTeams, isTechLead, currentUser]);

    useEffect(() => {
        setMemberValue(ALL_MEMBERS);
    }, [teamValue]);

    const filteredRows = useMemo(() => {
        const byTeam =
            teamValue === ALL_TEAMS
                ? rows
                : rows.filter((r) => r.team?.id != null && String(r.team.id) === teamValue);
        const byMember = memberValue === ALL_MEMBERS ? byTeam : byTeam.filter((r) => r.userId === memberValue);
        if (!isSales || currentUser?.id == null) return byMember;
        return byMember.filter((r) => String(r.userId) === String(currentUser.id));
    }, [rows, teamValue, memberValue, isSales, currentUser?.id]);

    const memberOptions = useMemo(() => {
        if (teamValue === ALL_TEAMS) return [];
        const map = new Map<string, Row>();
        for (const r of rows) {
            if (r.team?.id != null && String(r.team.id) === teamValue) {
                map.set(r.userId, r);
            }
        }
        return [...map.values()].sort((a, b) => {
            const la = `${a.lastName ?? ''} ${a.firstName ?? ''}`.toLowerCase();
            const lb = `${b.lastName ?? ''} ${b.firstName ?? ''}`.toLowerCase();
            return la.localeCompare(lb);
        });
    }, [rows, teamValue]);

    const rowsPerTeam = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of rows) {
            const tid = r.team?.id != null ? String(r.team.id) : '';
            if (!tid) continue;
            m.set(tid, (m.get(tid) ?? 0) + 1);
        }
        return m;
    }, [rows]);

    const maxSalesMonth = useMemo(() => Math.max(...filteredRows.map((r) => Math.max(0, r.salesMonth ?? 0)), 1), [filteredRows]);
    const maxAssignedLeads = useMemo(() => Math.max(...filteredRows.map((r) => Math.max(0, r.assignedLeads)), 1), [filteredRows]);

    const performanceRows = useMemo(() => {
        return filteredRows.map((r) => {
            const conversionRatePct = Math.max(0, Math.min(100, Number(r.conversionRate) || 0));
            const meetingCompletionRatePct =
                r.meetingsTotal > 0 ? Math.max(0, Math.min(100, (r.meetingsCompleted / r.meetingsTotal) * 100)) : 0;
            const salesImpactPct = Math.max(0, Math.min(100, ((r.salesMonth ?? 0) / maxSalesMonth) * 100));
            const leadCoveragePct = Math.max(0, Math.min(100, (r.assignedLeads / maxAssignedLeads) * 100));
            const score =
                conversionRatePct * KPI_WEIGHTS.conversionRate +
                meetingCompletionRatePct * KPI_WEIGHTS.meetingCompletionRate +
                salesImpactPct * KPI_WEIGHTS.salesImpact +
                leadCoveragePct * KPI_WEIGHTS.leadCoverage;

            return {
                row: r,
                indicators: {
                    conversionRatePct,
                    meetingCompletionRatePct,
                    salesImpactPct,
                    leadCoveragePct,
                },
                score: Math.round(score),
            };
        });
    }, [filteredRows, maxAssignedLeads, maxSalesMonth]);


    const isGlobalViewer = canPickAllTeams; // super_admin or operation_manager

    /** Aggregate leadsByStatus across ALL rows (all sales in scope). */
    const globalStatusTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        for (const r of rows) {
            for (const [status, count] of Object.entries(r.leadsByStatus ?? {})) {
                totals[status] = (totals[status] ?? 0) + Number(count);
            }
        }
        const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
        const sorted = Object.entries(totals)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1]);
        return { sorted, grandTotal };
    }, [rows]);

    if (loading) {
        return (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sira-text-muted">
                <Loader2 className="h-10 w-10 animate-spin text-sira-gold" />
                <p className="text-sm font-bold uppercase tracking-widest">{t('performance.loading')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-wrap items-start gap-4 justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-sira-gold mb-1">{t('performance.insights')}</p>
                    <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                        <BarChart3 className="h-7 w-7 text-sira-gold shrink-0" strokeWidth={2.25} />
                        {t('performance.teamPerformance')}
                    </h1>
                </div>
            </div>

            {/* ── Global Lead Stage Analytics (Admin / Ops only) ── */}
            {isGlobalViewer && globalStatusTotals.grandTotal > 0 && (
                <div dir={isRtl ? 'rtl' : 'ltr'} className="rounded-[1.75rem] border border-sira-border bg-sira-bg-card p-5 shadow-premium-xl ring-1 ring-border/30 sm:p-7">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1828] text-[#BF9B30]">
                                <PieChart className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-sira-text-muted">تحليلات الليدز</p>
                                <h2 className="text-[16px] font-black text-foreground">توزيع الليدز على المراحل</h2>
                            </div>
                        </div>
                        <div className="rounded-2xl bg-[#0B1828] px-4 py-2 text-center">
                            <p className="text-xl font-black text-white">{globalStatusTotals.grandTotal.toLocaleString()}</p>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">إجمالي الليدز</p>
                        </div>
                    </div>

                    {/* Stage bars */}
                    <div className="space-y-2.5">
                        {globalStatusTotals.sorted.map(([status, count]) => {
                            const pct = globalStatusTotals.grandTotal > 0
                                ? Math.round((count / globalStatusTotals.grandTotal) * 100)
                                : 0;
                            const badgeClass = leadStatusBadgeClass(status);
                            const label = translateLeadStatus(t, status);
                            return (
                                <div key={status} className="group">
                                    <div className="mb-1 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${badgeClass}`}>
                                                {label}
                                            </span>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="text-[11px] font-black text-foreground">{count.toLocaleString()}</span>
                                            <span className="w-9 text-end text-[10px] font-bold text-sira-text-muted">{pct}%</span>
                                        </div>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-sira-border/40">
                                        <div
                                            className="h-full rounded-full bg-[#0B1828] transition-all duration-500"
                                            style={{ width: `${Math.max(2, pct)}%`, opacity: 0.15 + (pct / 100) * 0.85 }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Quick summary chips */}
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {(() => {
                            const s = globalStatusTotals.sorted;
                            const get = (k: string) => s.find(([st]) => st === k)?.[1] ?? 0;
                            const active = get('follow_up') + get('qualified') + get('interested') + get('contacted');
                            const lost   = get('not_interested') + get('lost') + get('wrong_number') + get('switched_off');
                            const fresh  = get('new_lead') + get('assigned') + get('cold_call');
                            const won    = get('purchased') + get('converted');
                            return [
                                { label: 'جديد',    value: fresh, color: 'border-blue-200 bg-blue-50 text-blue-700' },
                                { label: 'نشط',     value: active, color: 'border-amber-200 bg-amber-50 text-amber-700' },
                                { label: 'مُغلق ✓', value: won,   color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
                                { label: 'خسارة',   value: lost,  color: 'border-rose-200 bg-rose-50 text-rose-700' },
                            ].map((chip) => (
                                <div key={chip.label} className={`rounded-2xl border p-3 text-center ${chip.color}`}>
                                    <p className="text-lg font-black">{chip.value.toLocaleString()}</p>
                                    <p className="text-[10px] font-black uppercase tracking-wide opacity-75">{chip.label}</p>
                                </div>
                            ));
                        })()}
                    </div>
                </div>
            )}

            {!isSales && teams.length > 0 && (
                <div
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className="rounded-[1.75rem] border border-sira-border bg-gradient-to-br from-sira-bg-card via-card to-sira-bg-page/40 p-6 shadow-premium-xl ring-1 ring-border/40 dark:from-card dark:to-muted/15 sm:p-8"
                >
                    <div className="mb-6 flex flex-col gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sira-text-muted">
                            {t('performance.scope')}
                        </p>
                        <p className="max-w-2xl text-xs font-semibold leading-relaxed text-foreground/70">
                            {t('performance.cardFilterIntro')}
                        </p>
                    </div>

                    {/* Team picker — cards */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-sira-gold" aria-hidden />
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground">
                                {t('performance.team')}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {canPickAllTeams && (
                                <button
                                    type="button"
                                    aria-pressed={teamValue === ALL_TEAMS}
                                    onClick={() => setTeamValue(ALL_TEAMS)}
                                    className={cn(
                                        'group flex flex-col gap-3 rounded-[1.35rem] border-2 p-5 text-start transition-all duration-200',
                                        teamValue === ALL_TEAMS
                                            ? 'border-[#0B1828] bg-[#0B1828] text-white shadow-premium-brown ring-2 ring-[#BF9B30]/25'
                                            : 'border-sira-border bg-sira-bg-card hover:border-[#BF9B30]/55 hover:shadow-md dark:border-white/10 dark:hover:bg-foreground/[0.04]',
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                                            teamValue === ALL_TEAMS
                                                ? 'bg-white/15 text-[#BF9B30]'
                                                : 'bg-sira-bg-page text-sira-gold dark:bg-muted',
                                        )}
                                    >
                                        <Users className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                                    </div>
                                    <div className="min-w-0 space-y-1">
                                        <span className="block text-[15px] font-black leading-tight tracking-tight">
                                            {t('performance.allTeams')}
                                        </span>
                                        <span
                                            className={cn(
                                                'block text-[10px] font-bold uppercase tracking-widest',
                                                teamValue === ALL_TEAMS ? 'text-white/70' : 'text-sira-text-muted',
                                            )}
                                        >
                                            {t('performance.peopleInScope', { count: rows.length })}
                                        </span>
                                    </div>
                                </button>
                            )}
                            {teams.map((tm) => {
                                const sel = teamValue === tm.id;
                                const cnt = rowsPerTeam.get(tm.id) ?? 0;
                                return (
                                    <button
                                        key={tm.id}
                                        type="button"
                                        aria-pressed={sel}
                                        onClick={() => setTeamValue(tm.id)}
                                        className={cn(
                                            'group flex flex-col gap-3 rounded-[1.35rem] border-2 p-5 text-start transition-all duration-200',
                                            sel
                                                ? 'border-[#0B1828] bg-[#0B1828] text-white shadow-premium-brown ring-2 ring-[#BF9B30]/25'
                                                : 'border-sira-border bg-sira-bg-card hover:border-[#BF9B30]/55 hover:shadow-md dark:border-white/10 dark:hover:bg-foreground/[0.04]',
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                                                sel ? 'bg-white/15 text-[#BF9B30]' : 'bg-sira-bg-page text-sira-gold dark:bg-muted',
                                            )}
                                        >
                                            <Building2 className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <span className="line-clamp-2 text-[15px] font-black leading-tight">{tm.name}</span>
                                            <span
                                                className={cn(
                                                    'block text-[10px] font-bold uppercase tracking-widest',
                                                    sel ? 'text-white/70' : 'text-sira-text-muted',
                                                )}
                                            >
                                                {t('performance.peopleInScope', { count: cnt })}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Member picker — compact cards */}
                    {teamValue !== ALL_TEAMS && (
                        <div className="mt-8 space-y-4 border-t border-sira-border/80 pt-8">
                            <p className="text-xs font-semibold leading-relaxed text-foreground/70">
                                {t('performance.cardMemberIntro')}
                            </p>
                            <div className="flex items-center gap-2">
                                <UserCircle2 className="h-4 w-4 shrink-0 text-sira-gold" aria-hidden />
                                <span className="text-xs font-black uppercase tracking-[0.2em] text-foreground">
                                    {t('performance.teamMember')}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    aria-pressed={memberValue === ALL_MEMBERS}
                                    onClick={() => setMemberValue(ALL_MEMBERS)}
                                    className={cn(
                                        'flex min-h-[88px] min-w-[min(100%,164px)] max-w-[220px] flex-1 basis-[calc(50%-0.375rem)] flex-col justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-start transition-all sm:flex-initial sm:basis-auto',
                                        memberValue === ALL_MEMBERS
                                            ? 'border-[#0B1828] bg-[#0B1828] text-white shadow-premium-brown ring-2 ring-[#BF9B30]/25'
                                            : 'border-sira-border bg-white hover:border-emerald-500/35 hover:bg-emerald-50/40 dark:bg-sira-bg-card dark:hover:bg-foreground/[0.04]',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'text-[11px] font-black uppercase tracking-wide',
                                            memberValue === ALL_MEMBERS ? 'text-white' : 'text-emerald-800 dark:text-emerald-400',
                                        )}
                                    >
                                        {t('performance.allPeopleInTeam')}
                                    </span>
                                    <span
                                        className={cn(
                                            'text-[10px] font-bold',
                                            memberValue === ALL_MEMBERS ? 'text-white/70' : 'text-sira-text-muted',
                                        )}
                                    >
                                        {t('performance.peopleInScope', { count: memberOptions.length })}
                                    </span>
                                </button>
                                {memberOptions.map((r) => {
                                    const msel = memberValue === r.userId;
                                    const rL = roleLabel(r);
                                    return (
                                        <button
                                            key={r.userId}
                                            type="button"
                                            aria-pressed={msel}
                                            onClick={() => setMemberValue(r.userId)}
                                            className={cn(
                                                'flex min-h-[88px] min-w-[min(100%,164px)] max-w-[220px] flex-1 basis-[calc(50%-0.375rem)] flex-col justify-center gap-1 rounded-2xl border-2 px-4 py-3 text-start transition-all sm:flex-initial sm:basis-auto',
                                                msel
                                                    ? 'border-[#0B1828] bg-[#0B1828] text-white shadow-premium-brown ring-2 ring-[#BF9B30]/25'
                                                    : 'border-sira-border bg-white hover:border-sira-gold/40 hover:bg-sira-bg-page/80 dark:bg-sira-bg-card dark:hover:bg-foreground/[0.04]',
                                            )}
                                        >
                                            <span className="line-clamp-2 text-sm font-black leading-snug">{personLabel(r)}</span>
                                            {rL !== '—' && (
                                                <span
                                                    className={cn(
                                                        'line-clamp-1 text-[10px] font-bold uppercase tracking-wider',
                                                        msel ? 'text-white/70' : 'text-sira-text-muted',
                                                    )}
                                                >
                                                    {rL}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {performanceRows.length === 0 ? (
                <div className="rounded-3xl border border-sira-border bg-sira-bg-card px-4 py-12 text-center text-sm text-sira-text-muted shadow-lg shadow-black/5">
                    {t('performance.noPeopleMatch')}
                </div>
            ) : (
                <div className="space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
                    <div
                        className={cn(
                            'grid grid-cols-1 gap-4',
                            !isSales && 'md:grid-cols-2 xl:grid-cols-3',
                        )}
                    >
                        {performanceRows.map(({ row: r, score }) => {
                            const name = personLabel(r);
                            return (
                                <Link
                                    key={r.userId}
                                    to={`/personnel/${r.userId}`}
                                    className="group rounded-3xl border border-sira-border bg-sira-bg-card p-5 shadow-sm transition-all hover:border-[#BF9B30]/50 hover:shadow-lg flex flex-col"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-[#0B1828] dark:text-foreground">{name}</p>
                                            <p className="truncate text-[11px] font-semibold text-sira-text-muted">
                                                {roleLabel(r)} • {r.team?.name || '—'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {!isSales && (
                                                <div className="rounded-2xl bg-slate-100 px-3 py-1 text-xs font-black text-[#0B1828]">
                                                    {score}/100
                                                </div>
                                            )}
                                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B1828] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ArrowUpRight className="h-4 w-4" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                                        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-foreground/5">
                                            <span className="block text-[10px] text-slate-500">{t('performance.converted')}</span>
                                            <span className="font-black text-[#0B1828] dark:text-foreground">{r.convertedLeads}/{r.assignedLeads}</span>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-foreground/5">
                                            <span className="block text-[10px] text-slate-500">{t('performance.done')}</span>
                                            <span className="font-black text-[#0B1828] dark:text-foreground">{r.meetingsCompleted}/{r.meetingsTotal}</span>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-foreground/5">
                                            <span className="block text-[10px] text-slate-500">{t('salesProfile.assignedLeads')}</span>
                                            <span className="font-black text-[#0B1828] dark:text-foreground">{r.assignedLeadsTotal ?? r.assignedLeads}</span>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 px-2.5 py-2 dark:bg-foreground/5">
                                            <span className="block text-[10px] text-slate-500">{t('performance.meetings')}</span>
                                            <span className="font-black text-[#0B1828] dark:text-foreground">{r.meetingsTotal}</span>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[#BF9B30]"
                                                style={{ width: `${score}%` }}
                                            />
                                        </div>
                                        <span className="ms-3 text-[10px] font-black text-sira-text-muted">{score}%</span>
                                    </div>

                                    <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-[#0B1828]/10 bg-[#0B1828]/5 py-2 text-[11px] font-black text-[#0B1828] transition-colors group-hover:bg-[#0B1828] group-hover:text-white dark:border-sira-border dark:text-foreground dark:group-hover:bg-foreground/10">
                                        <ArrowUpRight className="h-3.5 w-3.5" />
                                        {t('performance.openProfile')}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>

                </div>
            )}
        </div>
    );
}

