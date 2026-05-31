import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, User, UserCircle, BookUser, Users } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { getTeam } from '../services/api';
import { toast } from '../lib/toast';
import { useSelector } from 'react-redux';
import { isAppRtl } from '../lib/i18nDirection';
import { cn } from '../lib/utils';
import { translateLeadStatus } from '../lib/leadStatusLabel';
import type { RootState } from '../redux/Store';

function roleLabelForUi(role: { name?: string; displayName?: string } | null | undefined, t: TFunction) {
    const roleName = String(role?.name ?? '').toLowerCase();
    if (roleName === 'tech_lead') return t('teamsPage.teamLeaderRole');
    return role?.displayName || role?.name || t('teamsPage.staffRoleFallback');
}

function LeadStatusBadge({ status }: { status: string }) {
    const { t } = useTranslation();
    const s = String(status || '').trim();
    const label = translateLeadStatus(t, s);
    const tone =
        s === 'converted'
            ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
            : s === 'lost' || s === 'not_interested'
              ? 'bg-red-500/12 text-red-700 border-red-500/25'
              : s === 'qualified' || s === 'interested'
                ? 'bg-[#BF9B30]/12 text-[#7a6218] border-[#BF9B30]/30'
                : 'bg-[#0B1828]/6 text-[#0B1828]/80 border-[#0B1828]/12';
    return (
        <span className={cn('inline-block rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone)}>
            {label}
        </span>
    );
}

export default function TeamDetail() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const { teamId } = useParams<{ teamId: string }>();
    const navigate = useNavigate();
    const currentUser = useSelector((state: RootState) => state.user.user);
    const roleName = currentUser?.role?.name ?? '';
    const canAccessTeams = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);
    const canManage = roleName === 'super_admin';

    const [team, setTeam] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!teamId || !canAccessTeams) return;
        (async () => {
            setLoading(true);
            try {
                const data = await getTeam(teamId);
                setTeam(data);
            } catch {
                toast.error(t('teamsPage.detailLoadFail'));
                navigate('/brokerage/teams', { replace: true });
            } finally {
                setLoading(false);
            }
        })();
    }, [teamId, canAccessTeams, navigate, t]);

    if (!canAccessTeams) {
        return (
            <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="mx-auto max-w-lg rounded-[1.75rem] border border-[#0B1828]/10 bg-white p-10 text-center shadow-sm"
            >
                <p className="text-sm font-bold text-[#0B1828]">{t('teamsPage.detailAccessDenied')}</p>
            </div>
        );
    }

    if (loading || !team) {
        return (
            <div dir={isRtl ? 'rtl' : 'ltr'} className="mx-auto max-w-7xl space-y-6 animate-pulse">
                <div className="h-10 w-40 rounded-xl bg-white shadow-sm ring-1 ring-[#0B1828]/8" />
                <div className="h-48 rounded-[2.25rem] bg-white shadow-sm ring-1 ring-[#0B1828]/8 sm:h-56" />
                <div className="h-64 rounded-[2rem] bg-white shadow-sm ring-1 ring-[#0B1828]/8" />
                <div className="h-96 rounded-[2rem] bg-white shadow-sm ring-1 ring-[#0B1828]/8" />
                <p className="sr-only">{t('teamsPage.detailLoadingTeam')}</p>
            </div>
        );
    }

    const members = team.members ?? [];
    const leadCount = Number(team._count?.leads) || 0;
    const memCount = members.length;
    const avgLeads = memCount > 0 ? Math.round(leadCount / memCount) : 0;
    const leader = team.teamLeader;
    const leaderFull = leader ? `${leader.firstName} ${leader.lastName}` : '—';
    const heroInitials = leader
        ? `${(leader.firstName?.[0] || '').toString()}${(leader.lastName?.[0] || '').toString()}`
        : (team.name?.slice(0, 2) || 'T').toString().toUpperCase();

    const cardWrap = 'rounded-[2rem] border border-[#0B1828]/8 bg-white p-6 shadow-[0_12px_40px_-24px_rgba(11,24,40,0.25)] dark:border-sira-border dark:bg-sira-bg-card';
    const tableWrap = 'overflow-x-auto rounded-2xl border border-[#0B1828]/10 bg-white';
    const thRow = 'border-b border-[#0B1828]/10 bg-white text-[10px] font-black uppercase tracking-widest text-[#0B1828]/70';

    return (
        <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500 pb-6"
        >
            <button
                type="button"
                onClick={() => navigate('/brokerage/teams')}
                className="inline-flex items-center gap-2 rounded-xl border border-[#0B1828]/12 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#0B1828]/80 shadow-sm transition hover:border-[#0B1828]/25 hover:text-[#0B1828]"
            >
                <ArrowLeft className={cn('h-4 w-4 shrink-0', isRtl && 'rotate-180')} />
                {t('teamsPage.backToList')}
            </button>

            <div className="relative overflow-hidden rounded-[2.25rem] border border-white/20 bg-gradient-to-br from-[#2f80ed] via-[#2d6df1] to-[#3456e8] p-6 text-white shadow-xl shadow-blue-600/25 sm:p-8">
                <div
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl',
                        isRtl ? '-left-20' : '-right-20',
                    )}
                />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-[#061a38] text-2xl font-black shadow-lg">
                            {heroInitials}
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{team.name}</h1>
                            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/90">
                                {t('teamsPage.detailLeader', { name: leaderFull })}
                            </p>
                        </div>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => navigate('/brokerage/teams', { state: { editTeamId: String(team.id) } })}
                            className="relative rounded-2xl border border-white/40 bg-white px-6 py-3 text-[10px] font-black uppercase tracking-widest text-[#0B1828] shadow-md transition hover:bg-white/95"
                        >
                            {t('teamsPage.editTeam')}
                        </button>
                    )}
                </div>
                <div className="relative mt-6 grid grid-cols-1 gap-3 border-t border-white/25 pt-6 sm:grid-cols-3">
                    {[
                        { label: t('teamsPage.detailStatsSales'), value: memCount, icon: Users },
                        { label: t('teamsPage.detailStatsLeads'), value: leadCount, icon: User },
                        { label: t('teamsPage.detailStatsAvg'), value: avgLeads, icon: UserCircle },
                    ].map((row) => (
                        <div
                            key={row.label}
                            className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/15 px-4 py-3 backdrop-blur-sm"
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                                <row.icon className="h-5 w-5 text-white" aria-hidden />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-white/85">{row.label}</p>
                                <p className="mt-0.5 text-3xl font-black tabular-nums leading-none">{row.value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {team.teamLeader && (
                <section className={cardWrap}>
                    <div className="mb-5 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#BF9B30]/35 bg-[#BF9B30]/14 text-[#7a6218]">
                            <User className="h-5 w-5" aria-hidden />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0B1828]/70">
                                {t('teamsPage.teamLeaderRole')}
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-[#0B1828]/55">{t('teamsPage.viewTeamDetails')}</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="truncate text-xl font-black text-[#0B1828]">
                                {team.teamLeader.firstName} {team.teamLeader.lastName}
                            </p>
                            <p className="mt-1 truncate text-sm font-semibold text-[#0B1828]/65">{team.teamLeader.email}</p>
                        </div>
                        <Link
                            to={`/personnel/${team.teamLeader.id}`}
                            className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-[#0B1828]/12 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-[#0B1828] shadow-sm transition hover:border-[#BF9B30]/40 hover:bg-[#BF9B30]/8"
                        >
                            <UserCircle className="h-4 w-4" aria-hidden />
                            {t('teamsPage.openProfile')}
                        </Link>
                    </div>
                    {(team.teamLeader.assignedLeads?.length ?? 0) === 0 ? (
                        <p className="mt-5 rounded-2xl border border-dashed border-[#0B1828]/12 bg-white px-4 py-3 text-sm font-semibold text-[#0B1828]/70">
                            {t('teamsPage.noLeadsForTechLead')}
                        </p>
                    ) : (
                        <div className={cn('mt-5', tableWrap)}>
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className={thRow}>
                                        <th className="px-4 py-3">{t('leads.customer')}</th>
                                        <th className="px-4 py-3">{t('leads.phone')}</th>
                                        <th className="px-4 py-3">{t('leads.status')}</th>
                                        <th className="px-4 py-3">{t('salesProfile.updated')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {team.teamLeader.assignedLeads.map((l: any) => (
                                        <tr key={String(l.id)} className="border-b border-[#0B1828]/6 bg-white last:border-0">
                                            <td className="px-4 py-3 font-bold text-[#0B1828]">
                                                {[l.firstName, l.lastName].filter(Boolean).join(' ') ||
                                                    t('hrModule.emDash')}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-[#0B1828]/70" dir="ltr">
                                                {l.phone ?? t('hrModule.emDash')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <LeadStatusBadge status={l.status} />
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#0B1828]/65">
                                                {l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : t('hrModule.emDash')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            <section className={cardWrap}>
                <div className="mb-5 flex flex-col gap-3 border-b border-[#0B1828]/8 pb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.22em] text-[#0B1828]/70">
                            {t('teamsPage.colMembers')}
                        </h2>
                        <p className="mt-1.5 max-w-xl text-sm font-semibold leading-relaxed text-[#0B1828]/65">
                            {t('teamsPage.memberIntro')}
                        </p>
                    </div>
                </div>
                {members.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#0B1828]/12 bg-white py-12 text-center">
                        <p className="text-sm font-bold text-[#0B1828]/75">{t('teamsPage.noMembersYet')}</p>
                    </div>
                ) : (
                    <ul className="space-y-4">
                        {members.map((m: any) => {
                            const leadRows = m.assignedLeads ?? [];
                            return (
                                <li
                                    key={m.id}
                                    className="overflow-hidden rounded-2xl border border-[#0B1828]/10 bg-white shadow-sm ring-1 ring-[#0B1828]/5"
                                >
                                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-[#0B1828]">
                                                {m.firstName} {m.lastName}
                                                <span className="ms-2 text-xs font-bold text-[#0B1828]/50">
                                                    ({roleLabelForUi(m.role, t)})
                                                </span>
                                            </p>
                                            <p className="mt-1 truncate text-xs font-semibold text-[#0B1828]/60">{m.email}</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                to={`/personnel/${m.id}`}
                                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#0B1828]/12 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#0B1828] shadow-sm transition hover:border-[#0B1828]/25"
                                            >
                                                <UserCircle className="h-4 w-4" aria-hidden />
                                                {t('salesProfile.openProfile', { defaultValue: 'Profile' })}
                                            </Link>
                                            {['super_admin', 'hr'].includes(roleName) && (
                                                <Link
                                                    to={`/personnel/${m.id}/hr`}
                                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-[#BF9B30]/45 bg-[#BF9B30]/10 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#0B1828] transition hover:bg-[#BF9B30]/18"
                                                >
                                                    <BookUser className="h-4 w-4" aria-hidden />
                                                    {t('teamsPage.hrShortcut')}
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                    {leadRows.length > 0 && (
                                        <div className="border-t border-[#0B1828]/8 bg-white px-5 pb-5 pt-4">
                                            <p className="mb-3 text-[9px] font-black uppercase tracking-widest text-[#0B1828]/55">
                                                {t('teamsPage.memberAssignedLeads', { count: leadRows.length })}
                                            </p>
                                            <div className={cn(tableWrap, 'rounded-xl border-[#0B1828]/8')}>
                                                <table className="w-full text-left text-[11px]">
                                                    <thead>
                                                        <tr className={thRow}>
                                                            <th className="px-3 py-2.5">{t('leads.customer')}</th>
                                                            <th className="px-3 py-2.5">{t('leads.phone')}</th>
                                                            <th className="px-3 py-2.5">{t('leads.status')}</th>
                                                            <th className="px-3 py-2.5">{t('leads.priority')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {leadRows.map((l: any) => (
                                                            <tr
                                                                key={String(l.id)}
                                                                className="border-b border-[#0B1828]/5 bg-white last:border-0"
                                                            >
                                                                <td className="whitespace-nowrap px-3 py-2.5 font-bold text-[#0B1828]">
                                                                    {[l.firstName, l.lastName].filter(Boolean).join(' ') ||
                                                                        t('hrModule.emDash')}
                                                                </td>
                                                                <td className="px-3 py-2.5 font-semibold text-[#0B1828]/65" dir="ltr">
                                                                    {l.phone ?? t('hrModule.emDash')}
                                                                </td>
                                                                <td className="px-3 py-2.5">
                                                                    <LeadStatusBadge status={l.status} />
                                                                </td>
                                                                <td className="px-3 py-2.5 capitalize font-semibold text-[#0B1828]/65">
                                                                    {l.priority ?? t('hrModule.emDash')}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
