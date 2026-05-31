import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    UserPlus,
    UserMinus,
    BarChart2,
    Users,
    CheckCircle2,
    Briefcase,
} from 'lucide-react';
import {
    getAllTeams,
    getTeam,
    getAccountsForTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    updateUser
} from '../services/api';
import Modal from '../components/ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import { toast } from '../lib/toast';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { getRoleDisplayName } from '../lib/userRole';
import { isAppRtl } from '../lib/i18nDirection';
import { cn } from '../lib/utils';
import type { RootState } from '../redux/Store';

const INITIAL_TEAM_FORM = { name: '', teamLeaderId: '' };

export default function Teams() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = useSelector((state: RootState) => state.user.user);
    const [searchTerm, setSearchTerm] = useState('');
    const [teams, setTeams] = useState<any[]>([]);
    const [techLeads, setTechLeads] = useState<any[]>([]);
    const [salesUsers, setSalesUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [editingTeam, setEditingTeam] = useState<any>(null);
    const [teamDetail, setTeamDetail] = useState<any>(null);
    const [teamToDelete, setTeamToDelete] = useState<any>(null);
    const [form, setForm] = useState(INITIAL_TEAM_FORM);
    const [formLoading, setFormLoading] = useState(false);
    const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [memberPickerFocused, setMemberPickerFocused] = useState(false);
    const [createSalesSearch, setCreateSalesSearch] = useState('');
    const memberPickerRef = useRef<HTMLDivElement>(null);

    const canManage = currentUser?.role?.name === 'super_admin';

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const editId = (location.state as { editTeamId?: string } | null)?.editTeamId;
        if (!editId || teams.length === 0) return;
        const teamMatch = teams.find((x: any) => String(x.id) === String(editId));
        if (teamMatch) {
            openEdit(teamMatch);
            navigate('/brokerage/teams', { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run when teams load or state requests edit
    }, [location.state, teams]);

    async function loadData() {
        setLoading(true);
        try {
            const [teamsRes, accounts] = await Promise.all([
                getAllTeams(),
                getAccountsForTeams(),
            ]);
            setTeams(Array.isArray(teamsRes) ? teamsRes : (teamsRes?.data ?? teamsRes ?? []));
            setTechLeads(accounts.techLeads ?? []);
            setSalesUsers(accounts.sales ?? []);
        } catch (e) {
            toast.error(t('teamsPage.toastLoadFail'));
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const filteredTeams = teams.filter((t: any) =>
        t.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const hubStats = useMemo(() => {
        const totalLeads = teams.reduce((a, t) => a + (Number(t._count?.leads) || 0), 0);
        const totalMembers = teams.reduce((a, t) => a + (Number(t._count?.members) || 0), 0);
        const active = teams.filter((t) => t.status === 'active').length;
        return {
            totalTeams: teams.length,
            totalLeads,
            totalMembers,
            activeTeams: active,
        };
    }, [teams]);

    function resetTeamModalSearchState() {
        setMemberSearchQuery('');
        setCreateSalesSearch('');
        setMemberPickerFocused(false);
    }

    function openCreate() {
        setEditingTeam(null);
        setTeamDetail(null);
        setForm(INITIAL_TEAM_FORM);
        setCreateMemberIds([]);
        resetTeamModalSearchState();
        setIsFormOpen(true);
    }

    async function openEdit(team: any) {
        setEditingTeam(team);
        setForm({ name: team.name, teamLeaderId: team.teamLeaderId ? String(team.teamLeaderId) : '' });
        resetTeamModalSearchState();
        try {
            const detail = await getTeam(team.id);
            setTeamDetail(detail);
        } catch {
            setTeamDetail({ ...team, members: team.members || [] });
        }
        setIsFormOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setFormLoading(true);
        try {
            const payload = {
                name: form.name,
                teamLeaderId: form.teamLeaderId ? Number(form.teamLeaderId) : null
            };
            if (editingTeam) {
                await updateTeam(editingTeam.id, payload);
                if (payload.teamLeaderId) {
                    try {
                        await updateUser(String(payload.teamLeaderId), { teamId: Number(editingTeam.id) });
                    } catch (_) {}
                }
                toast.success(t('teamsPage.toastUpdated'));
            } else {
                const created = await createTeam(payload);
                const newId = created?.id ?? created?.data?.id;
                const newIdNum = newId != null ? Number(newId) : null;
                if (payload.teamLeaderId && newIdNum != null) {
                    try {
                        await updateUser(String(payload.teamLeaderId), { teamId: newIdNum });
                    } catch (_) {}
                }
                for (const uid of createMemberIds) {
                    if (!uid) continue;
                    try {
                        await updateUser(uid, { teamId: newIdNum });
                    } catch (_) {}
                }
                toast.success(t('teamsPage.toastCreated'));
            }
            setIsFormOpen(false);
            loadData();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('teamsPage.toastActionFail'));
        } finally {
            setFormLoading(false);
        }
    }

    async function addMember(userId: string) {
        if (!userId || !editingTeam) return;
        setFormLoading(true);
        try {
            await updateUser(String(userId), { teamId: Number(editingTeam.id) });
            toast.success(t('teamsPage.memberAdded'));
            setMemberSearchQuery('');
            setMemberPickerFocused(false);
            const detail = await getTeam(editingTeam.id);
            setTeamDetail(detail);
            loadData();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('teamsPage.memberAddFail'));
        } finally {
            setFormLoading(false);
        }
    }

    async function removeMember(userId: number | string) {
        if (!editingTeam) return;
        setFormLoading(true);
        try {
            await updateUser(String(userId), { teamId: null });
            toast.success(t('teamsPage.memberRemoved'));
            const detail = await getTeam(editingTeam.id);
            setTeamDetail(detail);
            loadData();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('teamsPage.memberRemoveFail'));
        } finally {
            setFormLoading(false);
        }
    }

    async function handleDelete() {
        if (!teamToDelete) return;
        setFormLoading(true);
        try {
            await deleteTeam(teamToDelete.id);
            toast.success(t('teamsPage.teamDeleted'));
            setIsDeleteOpen(false);
            setTeamToDelete(null);
            loadData();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('teamsPage.deleteFail'));
        } finally {
            setFormLoading(false);
        }
    }

    const members = teamDetail?.members ?? [];
    const memberIds = new Set(members.map((m: any) => m.id));
    const availableSalesToAdd = salesUsers.filter((u: any) => !memberIds.has(u.id));

    const filteredSalesToAdd = useMemo(() => {
        const q = memberSearchQuery.trim().toLowerCase();
        if (!q) return [] as any[];
        return availableSalesToAdd.filter((u: any) => {
            const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
            const email = String(u.email ?? '').toLowerCase();
            const team = String(u.team?.name ?? '').toLowerCase();
            return name.includes(q) || email.includes(q) || team.includes(q);
        });
    }, [availableSalesToAdd, memberSearchQuery]);

    const filteredSalesForCreate = useMemo(() => {
        const q = createSalesSearch.trim().toLowerCase();
        if (!q) return salesUsers;
        return salesUsers.filter((u: any) => {
            const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
            const email = String(u.email ?? '').toLowerCase();
            const team = String(u.team?.name ?? '').toLowerCase();
            return name.includes(q) || email.includes(q) || team.includes(q);
        });
    }, [salesUsers, createSalesSearch]);

    const showMemberSearchResults = memberPickerFocused && memberSearchQuery.trim().length > 0;

    useEffect(() => {
        if (!memberPickerFocused) return;
        const onDown = (e: MouseEvent) => {
            const el = memberPickerRef.current;
            if (el && !el.contains(e.target as Node)) setMemberPickerFocused(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMemberPickerFocused(false);
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [memberPickerFocused]);

    const statCards = useMemo(
        () =>
            [
                { label: t('teamsPage.statTotalTeams'), value: hubStats.totalTeams, icon: Briefcase, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
                { label: t('teamsPage.statTotalSales'), value: hubStats.totalMembers, icon: BarChart2, className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
                { label: t('teamsPage.statTotalLeads'), value: hubStats.totalLeads, icon: Users, className: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300' },
                { label: t('teamsPage.statActiveTeams'), value: hubStats.activeTeams, icon: CheckCircle2, className: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
            ] as const,
        [hubStats, t]
    );

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">
            {/* Hero header */}
            <div className="rounded-[2.25rem] border border-slate-200/80 bg-gradient-to-br from-white to-slate-50 px-5 py-6 shadow-sm sm:px-8 sm:py-7">
                <div className={cn('flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between', isRtl ? 'sm:flex-row-reverse' : '')}>
                    <div className={cn('space-y-1', isRtl ? 'text-right' : 'text-left')}>
                        <h1 className="text-3xl font-black tracking-tight text-[#0B1828] dark:text-foreground">
                            {t('teamsPage.hubTitle')}
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                            {t('teamsPage.hubSubtitle')}
                        </p>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#061a38] px-8 text-[12px] font-black tracking-widest text-white shadow-lg shadow-[#061a38]/25 transition-all hover:bg-[#0b244a] active:scale-[0.98]"
                        >
                            {t('teamsPage.addTeam')}
                            <Plus className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Top stats — rounded pills like sira-dashboard */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map(({ label, value, icon: Icon, className }) => (
                    <div
                        key={label}
                        className="flex min-h-[150px] flex-col gap-4 rounded-[1.9rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-tight text-start">{label}</p>
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${className}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                        </div>
                        <p className="mt-auto text-4xl font-black text-[#0B1828] dark:text-foreground tabular-nums">{value}</p>
                    </div>
                ))}
            </div>

            {/* Search */}
            <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                <div className="relative max-w-md group">
                    <Search
                        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-[#0B1828] dark:group-focus-within:text-foreground ${
                            isRtl ? 'right-4' : 'left-4'
                        }`}
                    />
                    <input
                        type="text"
                        placeholder={t('teamsPage.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 text-sm font-bold text-[#0B1828] placeholder:text-slate-400 outline-none transition focus:border-[#0B1828]/30 focus:ring-2 focus:ring-[#0B1828]/5 dark:border-sira-border dark:bg-foreground/5 dark:text-foreground ${
                            isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4'
                        }`}
                    />
                </div>
            </div>

            {/* Team cards grid — sira-dashboard card shape */}
            {loading ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="h-72 animate-pulse rounded-[1.75rem] border border-slate-100 bg-slate-100/80 dark:border-sira-border dark:bg-foreground/5" />
                    <div className="h-72 animate-pulse rounded-[1.75rem] border border-slate-100 bg-slate-100/80 dark:border-sira-border dark:bg-foreground/5" />
                </div>
            ) : filteredTeams.length === 0 ? (
                <div className="rounded-[1.75rem] border border-slate-200/80 bg-white p-12 text-center text-sm text-slate-500 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                    {t('teamsPage.noTeams')}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {filteredTeams.map((team: any) => {
                        const lead = team.teamLeader;
                        const leadName = lead
                            ? `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim()
                            : '—';
                        const initials = lead
                            ? `${(lead.firstName?.[0] || '').toString()}${(lead.lastName?.[0] || '').toString()}`
                            : (team.name?.slice(0, 2) || 'T').toString().toUpperCase();
                        const members = Number(team._count?.members) || 0;
                        const leadCount = Number(team._count?.leads) || 0;
                        const avgPer = members > 0 ? Math.round(leadCount / members) : 0;
                        const isActive = team.status === 'active';

                        return (
                            <div
                                key={String(team.id)}
                                className="group relative flex flex-col gap-5 rounded-[1.9rem] border border-slate-200/80 bg-white p-6 shadow-sm transition hover:shadow-lg dark:border-sira-border dark:bg-sira-bg-card"
                            >
                                {canManage && (
                                    <div
                                        className={`absolute top-4 z-10 flex items-center gap-2 rounded-full bg-white/85 p-1 shadow-sm backdrop-blur ${
                                            isRtl ? 'left-4' : 'right-4'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => openEdit(team)}
                                            aria-label={t('teamsPage.editTeam')}
                                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white p-0 text-slate-500 leading-none shadow-sm transition hover:border-[#BF9B30]/50 hover:text-[#0B1828]"
                                        >
                                            <Edit2 className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setTeamToDelete(team);
                                                setIsDeleteOpen(true);
                                            }}
                                            aria-label={t('teamsPage.deleteTeam')}
                                            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white p-0 text-rose-500 leading-none shadow-sm transition hover:border-rose-300"
                                        >
                                            <Trash2 className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-start justify-between gap-3 pe-2">
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B1828] text-sm font-black text-white shadow-md">
                                            {initials}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate" title={team.name}>
                                                {team.name}
                                            </p>
                                            <p className="mt-1 font-black text-base text-[#0B1828] dark:text-foreground leading-tight truncate" title={leadName}>
                                                {leadName}
                                            </p>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                                {t('teamsPage.teamLeaderRole')}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wider ${
                                            isActive
                                                ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400'
                                                : 'bg-slate-100 text-slate-500 dark:bg-foreground/10'
                                        }`}
                                    >
                                        {isActive ? t('teamsPage.statusActive') : t('teamsPage.statusInactive')}
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    <div className="flex flex-col gap-1 rounded-2xl bg-amber-50/90 px-2.5 py-3 text-center dark:bg-amber-500/10">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-amber-800/80 dark:text-amber-200/80">
                                            {t('teamsPage.cardAverage')}
                                        </p>
                                        <p className="text-lg font-black text-amber-900 dark:text-amber-100 tabular-nums">{avgPer}</p>
                                    </div>
                                    <div className="flex flex-col gap-1 rounded-2xl bg-sky-50/90 px-2.5 py-3 text-center dark:bg-sky-500/10">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-sky-800/80 dark:text-sky-200/80">
                                            {t('teamsPage.cardLeads')}
                                        </p>
                                        <p className="text-lg font-black text-sky-900 dark:text-sky-100 tabular-nums">{leadCount}</p>
                                    </div>
                                    <div className="flex flex-col gap-1 rounded-2xl bg-indigo-50/90 px-2.5 py-3 text-center dark:bg-indigo-500/10">
                                        <p className="text-[8px] font-bold uppercase tracking-widest text-indigo-800/80 dark:text-indigo-200/80">
                                            {t('teamsPage.cardSales')}
                                        </p>
                                        <p className="text-lg font-black text-indigo-900 dark:text-indigo-100 tabular-nums">{members}</p>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => navigate(`/teams/${team.id}`)}
                                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f80ed] to-[#2563eb] py-3.5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/25 transition hover:from-[#3b8eff] hover:to-[#2f6ff2] active:scale-[0.99]"
                                >
                                    {t('teamsPage.viewTeam')}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create / Edit Team Modal */}
            <Modal
                isOpen={isFormOpen}
                onClose={() => {
                    resetTeamModalSearchState();
                    setIsFormOpen(false);
                }}
                title={editingTeam ? t('teamsPage.modalEditTitle') : t('teamsPage.modalNewTitle')}
                subtitle={t('teamsPage.formModalSubtitle')}
                dir={isRtl ? 'rtl' : 'ltr'}
                size="lg"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                        <Users className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="modal-label">{t('teamsPage.teamName')}</label>
                        <input
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="modal-input"
                            placeholder={t('teamsPage.teamNamePlaceholder')}
                        />
                    </div>
                    <div>
                        <label className="modal-label">{t('teamsPage.assignTechLead')}</label>
                        <Select
                            value={form.teamLeaderId ? String(form.teamLeaderId) : '__none__'}
                            onValueChange={(v) =>
                                setForm({ ...form, teamLeaderId: v === '__none__' ? '' : v })
                            }
                        >
                            <SelectTrigger
                                className={cn(
                                    'modal-field-select !h-12 !min-h-12 border-slate-200 font-bold uppercase tracking-wide text-[#0B1828] [&_svg]:text-[#0B1828]/50',
                                    'focus-visible:border-black focus-visible:ring-2 focus-visible:ring-black/20 data-[placeholder]:text-slate-400',
                                )}
                            >
                                <SelectValue placeholder={t('teamsPage.selectTechLead')} />
                            </SelectTrigger>
                            <SelectContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                avoidCollisions={false}
                                className="z-[21050] rounded-2xl border-2 border-slate-200 bg-white shadow-2xl"
                            >
                                <SelectItem value="__none__" className="rounded-xl font-bold text-[#0B1828]">
                                    {t('teamsPage.selectTechLead')}
                                </SelectItem>
                                {techLeads.map((u: any) => (
                                    <SelectItem key={u.id} value={String(u.id)} className="rounded-xl font-bold text-[#0B1828]">
                                        {u.firstName} {u.lastName}
                                        {u.team?.name ? ` · ${u.team.name}` : ` · ${t('teamsPage.noTeam')}`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {techLeads.length === 0 && (
                            <p className="mt-2 text-xs font-bold text-amber-700">{t('teamsPage.noTechLeadsHint')}</p>
                        )}
                        {techLeads.length > 0 && (
                            <p className="mt-2 text-xs font-semibold text-slate-500">{t('teamsPage.techLeadLinkedHint')}</p>
                        )}
                    </div>

                    {!editingTeam && salesUsers.length > 0 && (
                        <div className="modal-card-inset space-y-4 border border-slate-200/90 bg-[#fafbfc] pt-5">
                            <div>
                                <label className="modal-label">{t('teamsPage.addSalesOptional')}</label>
                                <p className="text-xs font-semibold leading-relaxed text-slate-600">
                                    {t('teamsPage.addSalesHelp')}
                                </p>
                            </div>
                            <div className="relative">
                                <Search
                                    className={cn('modal-input-icon', isRtl ? 'end-4' : 'start-4')}
                                />
                                <input
                                    type="search"
                                    value={createSalesSearch}
                                    onChange={(e) => setCreateSalesSearch(e.target.value)}
                                    className={cn('modal-input', isRtl ? 'pe-11 ps-4' : 'ps-11 pe-4')}
                                    placeholder={t('teamsPage.searchSalesCheckbox')}
                                    autoComplete="off"
                                />
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {filteredSalesForCreate.length} / {salesUsers.length}
                            </p>
                            <div className="modal-card-inset max-h-52 space-y-0.5 overflow-y-auto border border-slate-200 bg-white p-2 shadow-inner">
                                {filteredSalesForCreate.length === 0 ? (
                                    <p className="py-8 text-center text-sm font-semibold text-slate-500">
                                        {t('teamsPage.noMemberSearchResults')}
                                    </p>
                                ) : (
                                    filteredSalesForCreate.map((u: any) => (
                                        <label
                                            key={u.id}
                                            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[#0B1828]/5"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={createMemberIds.includes(String(u.id))}
                                                onChange={(e) => {
                                                    if (e.target.checked)
                                                        setCreateMemberIds((prev) => [...prev, String(u.id)]);
                                                    else setCreateMemberIds((prev) => prev.filter((id) => id !== String(u.id)));
                                                }}
                                                className="size-4 shrink-0 rounded border-slate-300 text-[#BF9B30] accent-[#0B1828] focus:ring-2 focus:ring-black/20"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-black text-[#0B1828]">
                                                    {u.firstName} {u.lastName}
                                                </p>
                                                {u.email ? (
                                                    <p className="truncate text-[11px] font-semibold text-slate-500">{u.email}</p>
                                                ) : null}
                                            </div>
                                            {u.team?.name ? (
                                                <span className="shrink-0 text-[10px] font-black uppercase tracking-tight text-slate-400">
                                                    {u.team.name}
                                                </span>
                                            ) : null}
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {editingTeam && (
                        <div className="modal-card-inset space-y-4 border border-slate-200/90 bg-[#fafbfc] pt-5">
                            <div>
                                <label className="modal-label">{t('teamsPage.membersSales')}</label>
                                <p className="text-xs font-semibold leading-relaxed text-slate-600">
                                    {t('teamsPage.membersSalesHelp')}
                                </p>
                            </div>
                            <div className="space-y-4">
                                {members.length === 0 ? (
                                    <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-600">
                                        {t('teamsPage.noMembersYet')}
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {members.map((m: any) => (
                                            <li
                                                key={m.id}
                                                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                                            >
                                                <span className="min-w-0 text-sm font-black text-[#0B1828]">
                                                    {m.firstName} {m.lastName}{' '}
                                                    <span className="text-[11px] font-bold uppercase text-slate-500">
                                                        ({getRoleDisplayName(m.role, t) || '—'})
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeMember(m.id)}
                                                    disabled={formLoading}
                                                    aria-label={t('common.remove')}
                                                    className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                >
                                                    <UserMinus className="h-4 w-4" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {availableSalesToAdd.length > 0 && (
                                    <div ref={memberPickerRef} className="relative space-y-2 border-t border-slate-200/80 pt-4">
                                        <p className="text-xs font-semibold text-slate-600">
                                            {t('teamsPage.memberTypeToSearch')}
                                        </p>
                                        <div className="relative">
                                            <Search
                                                className={cn('modal-input-icon z-[2]', isRtl ? 'end-4' : 'start-4')}
                                            />
                                            <input
                                                type="search"
                                                value={memberSearchQuery}
                                                onChange={(e) => setMemberSearchQuery(e.target.value)}
                                                onFocus={() => setMemberPickerFocused(true)}
                                                className={cn(
                                                    'modal-input relative z-0 font-bold placeholder:font-semibold',
                                                    isRtl ? 'pe-11 ps-4' : 'ps-11 pe-4',
                                                )}
                                                placeholder={t('teamsPage.searchMemberPlaceholder')}
                                                autoComplete="off"
                                                aria-autocomplete="list"
                                                aria-expanded={showMemberSearchResults}
                                            />
                                            {showMemberSearchResults && (
                                                <div
                                                    className="absolute inset-x-0 top-full z-[21050] mt-2 max-h-60 overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white py-2 shadow-xl ring-1 ring-black/5"
                                                    role="listbox"
                                                >
                                                    {filteredSalesToAdd.length === 0 ? (
                                                        <p className="px-4 py-6 text-center text-sm font-semibold text-slate-500">
                                                            {t('teamsPage.noMemberSearchResults')}
                                                        </p>
                                                    ) : (
                                                        filteredSalesToAdd.map((u: any) => (
                                                            <button
                                                                key={u.id}
                                                                type="button"
                                                                role="option"
                                                                disabled={formLoading}
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => addMember(String(u.id))}
                                                                className="flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-black/5 active:bg-black/10"
                                                            >
                                                                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#BF9B30]/35 bg-[#BF9B30]/12 text-[#0B1828]">
                                                                    <UserPlus className="h-4 w-4" aria-hidden />
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-sm font-black text-[#0B1828]">
                                                                        {u.firstName} {u.lastName}
                                                                    </p>
                                                                    {u.email ? (
                                                                        <p className="truncate text-[11px] font-semibold text-slate-500">
                                                                            {u.email}
                                                                        </p>
                                                                    ) : null}
                                                                    {u.team?.name ? (
                                                                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                                                                            {u.team.name}
                                                                        </p>
                                                                    ) : (
                                                                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                                                            {t('teamsPage.noTeam')}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {memberSearchQuery.trim().length === 0 && (
                                            <p className="text-xs font-semibold text-slate-500">{t('teamsPage.addMemberHint')}</p>
                                        )}
                                    </div>
                                )}
                                {availableSalesToAdd.length === 0 && salesUsers.length > 0 && (
                                    <p className="text-xs font-semibold text-slate-600">{t('teamsPage.allSalesInTeam')}</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="modal-actions-stack">
                        <button type="submit" disabled={formLoading} className="modal-btn-primary">
                            {editingTeam ? t('teamsPage.saveTeam') : t('teamsPage.createTeam')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                resetTeamModalSearchState();
                                setIsFormOpen(false);
                            }}
                            className="modal-btn-secondary"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete confirmation */}
            <Modal
                isOpen={isDeleteOpen}
                onClose={() => {
                    setIsDeleteOpen(false);
                    setTeamToDelete(null);
                }}
                title={t('teamsPage.deleteModalTitle')}
                subtitle={t('teamsPage.deleteModalSubtitle')}
                dir={isRtl ? 'rtl' : 'ltr'}
                size="md"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-400/55 bg-red-50 text-red-800 shadow-sm">
                        <Trash2 className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                <div className="space-y-4">
                    <p className="text-sm text-foreground/70">{t('teamsPage.deleteConfirm', { name: teamToDelete?.name ?? '' })}</p>
                    <div className="modal-actions-stack">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={formLoading}
                            className="rounded-xl border-2 border-red-700 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-900 shadow-sm transition-colors hover:bg-red-100"
                        >
                            {t('teamsPage.delete')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsDeleteOpen(false);
                                setTeamToDelete(null);
                            }}
                            className="modal-btn-secondary"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

