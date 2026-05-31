import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    UserPlus,
    Search,
    Edit2,
    Trash2,
    Briefcase,
    Phone,
    Info,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import {
    getAllUsers,
    getAllTeams,
    getAllRoles,
    createUser,
    updateUser,
    deleteUser
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
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { isAppRtl } from '../lib/i18nDirection';
import type { RootState } from '../redux/Store';

// Must match backend seed / constants (includes marketing, hr).
const VALID_ROLE_NAMES = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead', 'sales', 'marketing', 'hr'] as const;
/** Roles that can be assigned to a sales team (optional) */
const ROLES_FOR_TEAM = ['sales', 'tech_lead', 'marketing'];
/** Role filter dropdown for tech lead: subordinate pod roles only */
const TECH_LEAD_FILTER_ROLES = ['sales', 'marketing', 'hr'] as const;
/** Rows a tech lead may see (includes self / other tech leads on the team; API also scopes by team) */
const TECH_LEAD_ROSTER_ROLES = ['sales', 'marketing', 'hr', 'tech_lead'] as const;
const INITIAL_USER_FORM = {
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    phone: '',
    roleId: '',
    teamId: '',
    title: '',
    status: 'active'
};

function getRoleBadgeColor(roleName: string | undefined) {
    if (!roleName) return 'bg-sira-gold/10 text-sira-gold border-secondary/20';
    const name = (roleName || '').toLowerCase();
    if (name.includes('admin')) return 'bg-red-500/10 text-red-500 border-red-500/20';
    if (name.includes('operation')) return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    if (name.includes('manager')) return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (name.includes('leader') || name.includes('tech')) return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    if (name.includes('sales')) return 'bg-amber-500/10 text-amber-800 border-amber-500/25 dark:text-amber-300';
    if (name.includes('market')) return 'bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/25';
    if (name === 'hr' || name.includes('human resource')) return 'bg-teal-500/10 text-teal-600 border-teal-500/25 dark:text-teal-300';
    return 'bg-sira-gold/10 text-sira-gold border-secondary/20';
}

function statusLabelForRow(status: string | undefined, t: TFunction) {
    const s = (status || '').toLowerCase();
    if (s === 'active') return t('agentsPage.statusActive');
    if (s === 'inactive') return t('agentsPage.statusInactive');
    if (s === 'suspended') return t('agentsPage.statusSuspended');
    return status || '—';
}

function roleLabelForUi(role: { name?: string; displayName?: string } | null | undefined, t: TFunction) {
    const roleName = String(role?.name ?? '').toLowerCase();
    if (roleName === 'tech_lead') return t('teamsPage.teamLeaderRole');
    return role?.displayName || role?.name || '—';
}

export default function Personnel() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const currentUser = useSelector((state: RootState) => state.user.user);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>('');
    const [teamFilter, setTeamFilter] = useState<string>('');
    const [users, setUsers] = useState<any[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [teams, setTeams] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [userToDelete, setUserToDelete] = useState<any>(null);
    const [form, setForm] = useState(INITIAL_USER_FORM);
    const [formLoading, setFormLoading] = useState(false);

    const roleName = currentUser?.role?.name || '';
    const isTechLead = roleName === 'tech_lead';
    const techLeadTeamDefaulted = useRef(false);

    const rolesForFilter = useMemo(() => {
        if (isTechLead) {
            return roles.filter((r: { name: string }) =>
                TECH_LEAD_FILTER_ROLES.includes(r.name as (typeof TECH_LEAD_FILTER_ROLES)[number]),
            );
        }
        return roles;
    }, [roles, isTechLead]);

    useEffect(() => {
        if (!isTechLead || teams.length === 0 || techLeadTeamDefaulted.current) return;
        const mine = currentUser?.teamId != null ? String(currentUser.teamId) : null;
        const pick = mine && teams.some((t: { id: string | number }) => String(t.id) === mine) ? mine : String(teams[0].id);
        setTeamFilter(pick);
        techLeadTeamDefaulted.current = true;
    }, [isTechLead, teams, currentUser?.teamId]);

    const canManage = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);
    const allowedRoleNames = currentUser?.role?.name === 'super_admin'
        ? ['operation_manager', 'sales_manager', 'tech_lead', 'sales', 'marketing', 'hr']
        : currentUser?.role?.name === 'operation_manager'
            ? ['sales_manager', 'tech_lead', 'sales', 'marketing', 'hr']
            : currentUser?.role?.name === 'sales_manager'
                ? ['tech_lead', 'sales', 'marketing']
                : currentUser?.role?.name === 'tech_lead'
                    ? ['sales', 'marketing', 'hr']
                    : [];

    useEffect(() => {
        loadData();
    }, [currentPage, searchTerm, roleFilter, teamFilter]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, roleFilter, teamFilter]);

    async function loadData() {
        setLoading(true);
        try {
            const [usersRes, teamsRes, rolesRes] = await Promise.all([
                getAllUsers({
                    limit: 10,
                    page: currentPage,
                    search: searchTerm || undefined,
                }),
                getAllTeams(),
                getAllRoles()
            ]);
            const data = usersRes?.data ?? [];
            setUsers(data);
            setTotalUsers(usersRes?.meta?.total ?? data.length);
            setTeams(Array.isArray(teamsRes) ? teamsRes : (teamsRes?.data ?? teamsRes ?? []));
            const allRoles = rolesRes?.data ?? rolesRes ?? [];
            setRoles(Array.isArray(allRoles) ? allRoles.filter((r: any) => VALID_ROLE_NAMES.includes(r.name)) : []);
        } catch (e) {
            toast.error(t('agentsPage.toastLoadFail'));
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    const totalPages = Math.ceil(totalUsers / 10);

    const filteredUsers = users.filter((u: any) => {
        if (isTechLead && u.role?.name && !TECH_LEAD_ROSTER_ROLES.includes(u.role.name)) {
            return false;
        }
        const matchRole = !roleFilter || u.role?.name === roleFilter;
        const matchTeam = !teamFilter || String(u.teamId) === teamFilter;
        return matchRole && matchTeam;
    });

    function openCreate() {
        setEditingUser(null);
        setForm(INITIAL_USER_FORM);
        setIsFormOpen(true);
    }

    async function openEdit(user: any) {
        setEditingUser(user);
        setForm({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            password: '',
            phone: user.phone || '',
            roleId: String(user.roleId),
            teamId: user.teamId ? String(user.teamId) : '',
            title: user.title || '',
            status: user.status || 'active'
        });
        setIsFormOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.roleId) {
            toast.error(t('agentsPage.toastSelectRole'));
            return;
        }
        setFormLoading(true);
        try {
            const payload: any = {
                ...form,
                roleId: Number(form.roleId),
                teamId: form.teamId ? Number(form.teamId) : null,
                status: form.status
            };
            if (!payload.teamId) delete payload.teamId;
            if (!payload.title) delete payload.title;
            if (editingUser) {
                if (!payload.password || payload.password.trim() === '') delete payload.password;
                else if (payload.password.length < 8) {
                    toast.error(t('agentsPage.toastPasswordLen'));
                    setFormLoading(false);
                    return;
                }
                await updateUser(String(editingUser.id), payload);
                toast.success(t('agentsPage.toastUpdated'));
            } else {
                await createUser(payload);
                toast.success(t('agentsPage.toastCreated'));
            }
            setIsFormOpen(false);
            loadData();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('agentsPage.toastActionFail'));
        } finally {
            setFormLoading(false);
        }
    }

    async function handleDelete() {
        if (!userToDelete) return;
        const id = userToDelete.id;
        if (id === undefined || id === null) {
            toast.error(t('agentsPage.toastInvalidUser'));
            return;
        }
        const idStr = String(id);
        setFormLoading(true);
        try {
            await deleteUser(idStr);
            toast.success(t('agentsPage.toastDeleted'));
            setIsDeleteOpen(false);
            setUserToDelete(null);
            loadData();
        } catch (err: any) {
            const msg = err.response?.data?.message || err.message || t('agentsPage.toastDeleteFail');
            toast.error(msg);
        } finally {
            setFormLoading(false);
        }
    }

    const showTeamField = form.roleId && ROLES_FOR_TEAM.includes(roles.find((r: any) => r.id === Number(form.roleId))?.name || '');

    return (
        <div className="min-h-screen bg-sira-bg-page p-6 md:p-10 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10 pt-4">
                <div className="space-y-1.5">
                    <h1 className="text-[32px] font-black text-sira-text-primary tracking-tighter uppercase italic">{t('agentsPage.title')}</h1>
                    <div className="flex items-center gap-3">
                        <div className="h-0.5 w-12 bg-sira-gold/40" />
                        <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em] italic">
                            {t('agentsPage.directoryAndRoster')}
                        </p>
                    </div>
                </div>

                {canManage && (
                    <button
                        onClick={openCreate}
                        className="h-14 px-8 rounded-2xl bg-sira-brown text-white text-[13px] font-black hover:bg-sira-brown-dark transition-all flex items-center gap-3 shadow-premium active:scale-95 uppercase tracking-widest"
                    >
                        <UserPlus className="w-5 h-5 text-sira-gold" />
                        <span>{t('agentsPage.addAgentUser')}</span>
                    </button>
                )}
            </div>

            {/* Integrated Filters Toolbar */}
            <div className="overflow-hidden rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium mb-8">
                <div className="flex flex-col gap-8 p-8 md:p-10">
                    <div className="flex flex-col md:flex-row w-full gap-4 md:items-stretch">
                        <div className="relative flex-1 min-w-0 group">
                            <Search className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-sira-text-muted transition-colors group-focus-within:text-sira-gold ${isRtl ? 'right-6' : 'left-6'}`} />
                            <input
                                type="text"
                                placeholder={t('agentsPage.searchPlaceholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`h-14 w-full bg-sira-bg-subtle border border-sira-border rounded-2xl text-[13px] font-bold text-sira-text-primary placeholder:text-sira-text-muted focus:ring-4 focus:ring-sira-gold/5 focus:border-sira-gold transition-all outline-none ${isRtl ? 'pr-16 pl-8' : 'pl-16 pr-8'}`}
                            />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 shrink-0">
                            <Select
                                value={roleFilter || '__all_roles__'}
                                onValueChange={(v) => setRoleFilter(v === '__all_roles__' ? '' : v)}
                            >
                                <SelectTrigger className="h-14 min-w-[200px] rounded-2xl bg-white border-sira-border text-[11px] font-black uppercase tracking-widest text-sira-text-primary shadow-sm">
                                    <SelectValue placeholder={t('agentsPage.allRoles')} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-sira-border shadow-xl">
                                    <SelectItem value="__all_roles__">{t('agentsPage.allRoles')}</SelectItem>
                                    {rolesForFilter.map((r: any) => (
                                        <SelectItem key={r.id} value={r.name}>
                                            {roleLabelForUi(r, t)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {(!isTechLead || teams.length > 0) && (
                                <Select
                                    value={
                                        isTechLead
                                            ? teamFilter || (teams[0] ? String(teams[0].id) : '')
                                            : teamFilter || '__all_teams__'
                                    }
                                    onValueChange={(v) => setTeamFilter(isTechLead ? v : v === '__all_teams__' ? '' : v)}
                                >
                                    <SelectTrigger className="h-14 min-w-[200px] rounded-2xl bg-white border-sira-border text-[11px] font-black uppercase tracking-widest text-sira-text-primary shadow-sm">
                                        <SelectValue
                                            placeholder={isTechLead ? t('agentsPage.team') : t('agentsPage.allTeams')}
                                        />
                                    </SelectTrigger>
                                    <SelectContent className="rounded-xl border-sira-border shadow-xl">
                                        {!isTechLead && (
                                            <SelectItem value="__all_teams__">{t('agentsPage.allTeams')}</SelectItem>
                                        )}
                                        {teams.map((team: { id: string | number; name: string }) => (
                                            <SelectItem key={team.id} value={String(team.id)}>
                                                {team.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-sira-bg-card rounded-[32px] border border-sira-border overflow-hidden shadow-premium">
                {loading ? (
                    <div className="p-12 text-center text-sira-text-muted italic text-xs animate-pulse">{t('agentsPage.loading')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="border-b border-sira-border bg-sira-bg-subtle/30">
                                    <th className="px-6 py-5 text-start text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                        {t('agentsPage.colName')}
                                    </th>
                                    <th className="px-6 py-5 text-start text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                        {t('leads.phone')}
                                    </th>
                                    <th className="px-6 py-5 text-start text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                        {t('agentsPage.colRole')}
                                    </th>
                                    <th className="px-6 py-5 text-start text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                        {t('agentsPage.colTeam')}
                                    </th>
                                    <th className="px-6 py-5 text-start text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                        {t('agentsPage.colStatus')}
                                    </th>
                                    {canManage && (
                                        <th className="px-6 py-5 text-end text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                                            {t('agentsPage.colActions')}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user: any) => (
                                    <tr key={user.id} className="border-b border-sira-border last:border-0 hover:bg-sira-bg-hover transition-colors group">
                                        <td className="px-6 py-5">
                                            <div>
                                                <p className="font-black text-sira-text-primary text-sm uppercase tracking-tight">{user.firstName} {user.lastName}</p>
                                                <p className="text-sira-text-muted text-[11px] font-medium">{user.email}</p>
                                                {(user.role?.name === 'sales' || user.role?.name === 'tech_lead') && (
                                                    <Link
                                                        to={`/personnel/${user.id}`}
                                                        className="text-[9px] font-black uppercase tracking-[0.15em] text-sira-gold hover:text-sira-brown mt-2 inline-block underline underline-offset-4"
                                                    >
                                                        {t('agentsPage.leadsProfileLink')}
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            {user.phone ? (
                                                <span className="inline-flex items-center gap-2 text-xs font-bold text-sira-text-secondary tabular-nums">
                                                    <Phone className="w-3.5 h-3.5 text-sira-gold/40" />{user.phone}
                                                </span>
                                            ) : (
                                                <span className="text-sira-text-muted/30 text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${getRoleBadgeColor(user.role?.displayName)}`}>
                                                {roleLabelForUi(user.role, t)}
                                                {user.title && <span className="opacity-70"> / {user.title}</span>}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <Briefcase className={`w-3.5 h-3.5 ${user.team ? 'text-sira-gold/60' : 'text-sira-text-muted/20'}`} />
                                                <span className="text-[11px] font-black uppercase tracking-tight text-sira-text-secondary">{user.team?.name || '—'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span
                                                className={`text-[9px] font-black uppercase tracking-widest ${user.status === 'active' ? 'text-emerald-600' : 'text-red-500'}`}
                                            >
                                                {statusLabelForRow(user.status, t)}
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td className="px-6 py-5 text-end">
                                                <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Link
                                                        to={`/personnel/${user.id}`}
                                                        className="p-2.5 rounded-xl bg-sira-bg-subtle text-sira-text-secondary hover:bg-sira-gold/10 hover:text-sira-gold transition-all"
                                                        title={t('agentsPage.leadsProfileLink')}
                                                    >
                                                        <Info className="w-4 h-4" />
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(user)}
                                                        className="p-2.5 rounded-xl bg-sira-bg-subtle text-sira-text-secondary hover:bg-sira-gold/10 hover:text-sira-gold transition-all"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setUserToDelete(user); setIsDeleteOpen(true); }}
                                                        className="p-2.5 rounded-xl bg-sira-bg-subtle text-sira-text-secondary hover:bg-red-500/10 hover:text-red-600 transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && filteredUsers.length === 0 && (
                    <div className="p-12 text-center text-foreground/40 text-sm">{t('agentsPage.noPersonnel')}</div>
                )}

                {/* Pagination Controls */}
                {!loading && totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-foreground/5 bg-white/[0.01]">
                        <p className="text-[10px] font-black uppercase tracking-wider text-foreground/30 italic">
                            {t('hrModule.showingPage', { page: currentPage, totalPages: totalPages, total: totalUsers })}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-xl bg-foreground/5 text-foreground/40 hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-foreground/5 transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-xl bg-foreground/5 text-foreground/40 hover:bg-foreground/10 disabled:opacity-30 disabled:hover:bg-foreground/5 transition-all"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Modal */}
            <Modal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                title={editingUser ? t('agentsPage.modalEditTitle') : t('agentsPage.modalAddTitle')}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.firstName')}
                            </label>
                            <input required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.lastName')}
                            </label>
                            <input required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.email')}
                            </label>
                            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" disabled={!!editingUser} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('leads.phone')}
                            </label>
                            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" placeholder={t('agentsPage.phonePlaceholder')} />
                        </div>
                    </div>
                    {!editingUser ? (
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.password')}
                            </label>
                            <input required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" minLength={8} placeholder={t('agentsPage.passwordMinPlaceholder')} />
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.newPasswordOptional')}
                            </label>
                            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="modal-input w-full rounded-2xl border-slate-200/90 bg-white px-4 py-3 text-xs font-bold text-[#0B1828] focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10" minLength={8} placeholder={t('agentsPage.newPasswordHint')} />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`space-y-1.5 ${showTeamField ? '' : 'col-span-2'}`}>
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.role')}
                            </label>
                            <Select
                                value={form.roleId || undefined}
                                onValueChange={(v) => setForm({ ...form, roleId: v, title: '' })}
                            >
                                <SelectTrigger className="modal-field-select rounded-2xl border-slate-200/90 bg-white py-3 text-xs font-bold text-[#0B1828]">
                                    <SelectValue placeholder={t('agentsPage.selectRole')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {roles
                                        .filter((r: any) => allowedRoleNames.includes(r.name))
                                        .map((r: any) => (
                                            <SelectItem key={r.id} value={String(r.id)}>
                                                {roleLabelForUi(r, t)}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {showTeamField && (
                            <div className="space-y-1.5">
                                <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                    {t('agentsPage.teamOptional')}
                                </label>
                                <Select
                                    value={form.teamId ? String(form.teamId) : '__unassigned__'}
                                    onValueChange={(v) =>
                                        setForm({ ...form, teamId: v === '__unassigned__' ? '' : v })
                                    }
                                >
                                    <SelectTrigger className="modal-field-select rounded-2xl border-slate-200/90 bg-white py-3 text-xs font-bold text-[#0B1828]">
                                        <SelectValue placeholder={t('agentsPage.team')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">{t('agentsPage.unassigned')}</SelectItem>
                                        {teams.map((team: { id: string | number; name: string }) => (
                                            <SelectItem key={team.id} value={String(team.id)}>
                                                {team.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-foreground/35 leading-snug">{t('agentsPage.teamHint')}</p>
                            </div>
                        )}
                    </div>
                    {roles.find((r: any) => r.id === Number(form.roleId))?.name === 'sales' && (
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.salesTitle')}
                            </label>
                            <Select
                                value={form.title || undefined}
                                onValueChange={(v) => setForm({ ...form, title: v })}
                            >
                                <SelectTrigger className="modal-field-select rounded-2xl border-slate-200/90 bg-white py-3 text-xs font-bold text-[#0B1828]">
                                    <SelectValue placeholder={t('agentsPage.selectTitle')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="advisor">{t('agentsPage.titleAdvisor')}</SelectItem>
                                    <SelectItem value="consultant">{t('agentsPage.titleConsultant')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {editingUser && (
                        <div className="space-y-1.5">
                            <label className="text-[9px] uppercase font-black tracking-wider text-slate-500">
                                {t('agentsPage.status')}
                            </label>
                            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                                <SelectTrigger className="modal-field-select rounded-2xl border-slate-200/90 bg-white py-3 text-xs font-bold text-[#0B1828]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">{t('agentsPage.statusActive')}</SelectItem>
                                    <SelectItem value="inactive">{t('agentsPage.statusInactive')}</SelectItem>
                                    <SelectItem value="suspended">{t('agentsPage.statusSuspended')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={formLoading} className="modal-btn-primary flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-wider disabled:opacity-50">
                            {editingUser ? t('agentsPage.update') : t('agentsPage.create')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Delete confirmation */}
            <Modal
                isOpen={isDeleteOpen}
                onClose={() => {
                    setIsDeleteOpen(false);
                    setUserToDelete(null);
                }}
                title={t('agentsPage.deleteModalTitle')}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <div className="space-y-4 p-2">
                    <p className="text-sm text-foreground/70">
                        {t('agentsPage.deleteConfirm', {
                            name: userToDelete
                                ? `${userToDelete.firstName} ${userToDelete.lastName}`.trim()
                                : '',
                        })}
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setIsDeleteOpen(false);
                                setUserToDelete(null);
                            }}
                            className="flex-1 rounded-xl border border-sira-border py-3 text-xs font-bold uppercase text-foreground/70"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={formLoading}
                            className="flex-1 rounded-xl bg-red-500 py-3 text-xs font-bold uppercase text-white hover:bg-red-600 disabled:opacity-50"
                        >
                            {t('agentsPage.delete')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

