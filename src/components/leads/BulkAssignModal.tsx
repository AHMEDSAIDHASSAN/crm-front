import React, { useState } from 'react';
import Modal from '../ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import { User, ShieldCheck, UserPlus, Timer, AlertTriangle, Users, Loader2, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { getUsersByRole, bulkAssignLeads, bulkSendLeadsToRotation, bulkClearAssignmentLeads } from '../../services/api';
import { toast } from '../../lib/toast';

interface BulkAssignModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadIds: number[];
    /** Assignees to hide from the list (e.g. current profile owner when reassigning their leads away). */
    excludeUserIds?: number[];
}

function assigneeOpenLeadsSuffix(u: any): string {
    const raw = u?._count?.assignedLeads;
    if (raw == null) return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    return ` · ${n.toLocaleString()}`;
}

type AssignAction = 'assign' | 'rotation';
type RotationBlockedLead = {
    id: string;
    name: string;
    assignedSales: { id: string; name: string } | null;
    meetingsCount: number;
    feedbacksCount: number;
};

export default function BulkAssignModal({ isOpen, onClose, leadIds, excludeUserIds }: BulkAssignModalProps) {
    const { t } = useTranslation();
    const currentUser = useSelector((state: any) => state.user.user);
    const excludedAssigneeIds = React.useMemo(
        () => new Set((excludeUserIds ?? []).map((x) => Number(x)).filter((n) => Number.isFinite(n))),
        [excludeUserIds],
    );
    const [users, setUsers] = useState<any[]>([]);
    const [salesUsers, setSalesUsers] = useState<any[]>([]);
    const [rotationBlockedLeads, setRotationBlockedLeads] = useState<RotationBlockedLead[]>([]);
    const [rotationForceSubmitting, setRotationForceSubmitting] = useState(false);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [assignAction, setAssignAction] = useState<AssignAction>('assign');
    const [assigneeSearch, setAssigneeSearch] = useState('');
    const [assigneeOpen, setAssigneeOpen] = useState(false);
    const [formData, setFormData] = useState({
        assignedTo: '',
        assignmentMode: 'standard',
        useTemporaryAssignment: false,
        assignmentDurationHours: '24',
        assignmentExpireAction: 'rotation' as 'rotation' | 'backup_sales',
        backupAssignUserId: '',
    });

    // Role can be { name: 'operation_manager' } or sometimes a string from API/localStorage
    const roleName = typeof currentUser?.role === 'string' ? currentUser.role : (currentUser?.role?.name ?? '');

    React.useEffect(() => {
        if (isOpen) {
            setAssignAction('assign');
            setFormData({
                assignedTo: '',
                assignmentMode: 'standard',
                useTemporaryAssignment: false,
                assignmentDurationHours: '24',
                assignmentExpireAction: 'rotation',
                backupAssignUserId: '',
            });
            setSalesUsers([]);
            setRotationBlockedLeads([]);
            setRotationForceSubmitting(false);
            setSubmitLoading(false);
            setAssigneeSearch('');
            setAssigneeOpen(false);
        }
    }, [isOpen]);

    React.useEffect(() => {
        if (isOpen && currentUser && assignAction === 'assign') {
            const roleToFetch = getTargetRole(formData.assignmentMode);
            if (roleToFetch) {
                fetchUsers(roleToFetch);
            } else {
                setUsers([]);
            }
        }
    }, [isOpen, currentUser, formData.assignmentMode, assignAction, excludedAssigneeIds]);

    React.useEffect(() => {
        if (!isOpen || assignAction !== 'assign' || !formData.useTemporaryAssignment) return;
        if (formData.assignmentExpireAction !== 'backup_sales') return;
        let cancelled = false;
        (async () => {
            try {
                const response = await getUsersByRole('sales');
                const list = response.data || response || [];
                if (!cancelled) setSalesUsers(Array.isArray(list) ? list : []);
            } catch {
                if (!cancelled) setSalesUsers([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, assignAction, formData.useTemporaryAssignment, formData.assignmentExpireAction]);

    // Standard flow: Super Admin -> Operation Manager -> Sales
    const getTargetRole = (mode: string) => {
        if (!roleName) return null;
        const role = roleName;
        if (mode === 'standard') {
            if (role === 'super_admin') return 'operation_manager';
            if (role === 'operation_manager') return 'sales';
        } else if (mode === 'customize') {
            if (role === 'super_admin' || role === 'operation_manager') return 'sales';
        }
        return null;
    };

    const canUseCustomize = roleName === 'super_admin' || roleName === 'operation_manager';

    const canSendToRotation = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);
    const canBulkClearAssignment = canSendToRotation;

    const fetchUsers = async (roleName: string) => {
        try {
            const response = await getUsersByRole(roleName);
            const fetchedUsers = response.data || response || [];
            setUsers(fetchedUsers);

            const list = Array.isArray(fetchedUsers) ? fetchedUsers : [];
            const first = list.find((u: any) => !excludedAssigneeIds.has(Number(u.id)));
            if (first && !formData.assignedTo) {
                setFormData(prev => ({ ...prev, assignedTo: String(first.id) }));
            }
        } catch (error) {
            console.error('Failed to fetch users:', error);
            setUsers([]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (assignAction === 'assign' && formData.assignedTo === '__unassigned__') {
            if (!canBulkClearAssignment) {
                toast.error(t('leads.bulkAssignModal.toastUnassignDenied'));
                return;
            }
            setSubmitLoading(true);
            try {
                await bulkClearAssignmentLeads({ leadIds });
                toast.success(
                    leadIds.length === 1
                        ? t('leads.bulkAssignModal.toastUnassignSuccessSingle')
                        : t('leads.bulkAssignModal.toastUnassignSuccessMulti', { count: leadIds.length }),
                );
                onClose();
            } catch (error: any) {
                console.error('Bulk unassign failed:', error);
                toast.error(error.response?.data?.message || t('leads.bulkAssignModal.toastUnassignFail'));
            } finally {
                setSubmitLoading(false);
            }
            return;
        }

        if (assignAction === 'rotation') {
            if (!canSendToRotation) {
                toast.error(t('leads.bulkAssignModal.toastRotationDenied'));
                return;
            }
            setSubmitLoading(true);
            try {
                await bulkSendLeadsToRotation({ leadIds });
                toast.success(
                    leadIds.length === 1
                        ? t('leads.bulkAssignModal.toastRotationSuccessSingle')
                        : t('leads.bulkAssignModal.toastRotationSuccessMulti', { count: leadIds.length }),
                );
                onClose();
            } catch (error: any) {
                console.error('Bulk rotation failed:', error);
                const payload = error?.response?.data;
                if (payload?.code === 'ROTATION_CONFIRM_REQUIRED' && Array.isArray(payload?.blockedLeads)) {
                    setRotationBlockedLeads(payload.blockedLeads as RotationBlockedLead[]);
                    return;
                }
                toast.error(payload?.message || t('leads.bulkAssignModal.toastRotationFail'));
            } finally {
                setSubmitLoading(false);
            }
            return;
        }

        if (!formData.assignedTo) {
            toast.error(t('leads.bulkAssignModal.toastSelectAssignee'));
            return;
        }

        const hours = parseInt(formData.assignmentDurationHours, 10);
        if (formData.useTemporaryAssignment) {
            if (!Number.isFinite(hours) || hours < 1) {
                toast.error(t('leads.bulkAssignModal.toastDurationInvalid'));
                return;
            }
            if (formData.assignmentExpireAction === 'backup_sales') {
                if (!formData.backupAssignUserId) {
                    toast.error(t('leads.bulkAssignModal.toastBackupRequired'));
                    return;
                }
                if (String(formData.backupAssignUserId) === String(formData.assignedTo)) {
                    toast.error(t('leads.bulkAssignModal.toastBackupDifferent'));
                    return;
                }
            }
        }

        setSubmitLoading(true);
        try {
            await bulkAssignLeads({
                leadIds,
                assignedTo: Number(formData.assignedTo),
                assignmentMode: formData.assignmentMode,
                ...(formData.useTemporaryAssignment && Number.isFinite(hours) && hours >= 1
                    ? {
                          assignmentDurationHours: hours,
                          assignmentExpireAction: formData.assignmentExpireAction,
                          ...(formData.assignmentExpireAction === 'backup_sales' && formData.backupAssignUserId
                              ? { backupAssignUserId: Number(formData.backupAssignUserId) }
                              : {}),
                      }
                    : {}),
            });
            if (formData.useTemporaryAssignment && Number.isFinite(hours) && hours >= 1) {
                toast.success(
                    formData.assignmentExpireAction === 'rotation'
                        ? t('leads.bulkAssignModal.toastAssignTempRotation', { count: leadIds.length })
                        : t('leads.bulkAssignModal.toastAssignTempBackup', { count: leadIds.length }),
                );
            } else {
                toast.success(t('leads.bulkAssignModal.toastAssignSuccess', { count: leadIds.length }));
            }
            onClose();
        } catch (error: any) {
            console.error('Bulk assignment failed:', error);
            toast.error(error.response?.data?.message || t('leads.bulkAssignModal.toastAssignFail'));
        } finally {
            setSubmitLoading(false);
        }
    };

    const sortedUsers = [...users]
        .filter((u: any) => !excludedAssigneeIds.has(Number(u.id)))
        .sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
    const filteredAssignees = sortedUsers.filter((u: any) => {
        const q = assigneeSearch.trim().toLowerCase();
        if (!q) return true;
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const role = String(u.role?.displayName || u.role?.name || '').toLowerCase();
        return fullName.includes(q) || role.includes(q);
    });

    const forceSendBlockedToRotation = async () => {
        if (rotationBlockedLeads.length === 0) return;
        setRotationForceSubmitting(true);
        try {
            await bulkSendLeadsToRotation({ leadIds, force: true });
            toast.success(
                leadIds.length === 1
                    ? t('leads.bulkAssignModal.toastRotationSuccessSingle')
                    : t('leads.bulkAssignModal.toastRotationSuccessMulti', { count: leadIds.length }),
            );
            setRotationBlockedLeads([]);
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || t('leads.bulkAssignModal.toastRotationFail'));
        } finally {
            setRotationForceSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                leadIds.length === 1
                    ? t('leads.bulkAssignModal.titleSingle')
                    : t('leads.bulkAssignModal.titleMulti', { count: leadIds.length })
            }
            subtitle={t('leads.bulkAssignModal.subtitle')}
            headerIcon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                    <Users className="h-6 w-6" aria-hidden />
                </div>
            }
            size="xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {canSendToRotation && (
                    <div className="modal-segment">
                        <button
                            type="button"
                            onClick={() => setAssignAction('assign')}
                            className={cn(
                                'modal-segment-btn',
                                assignAction === 'assign' ? 'modal-segment-btn-active' : 'modal-segment-btn-idle',
                            )}
                        >
                            {t('leads.bulkAssignModal.tabAssign')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAssignAction('rotation')}
                            className={cn(
                                'modal-segment-btn',
                                assignAction === 'rotation' ? 'modal-segment-btn-active' : 'modal-segment-btn-idle',
                            )}
                        >
                            {t('leads.bulkAssignModal.tabRotation')}
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-3 rounded-2xl border border-sira-brown/20 bg-sira-brown-light/30 p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sira-brown/35 bg-[#EDE5DC]/90 font-black text-[#5c4330] shadow-sm">
                        {leadIds.length}
                    </div>
                    <p className="text-sm font-bold text-sira-text-primary">
                        {leadIds.length === 1
                            ? t('leads.bulkAssignModal.selectedSingle')
                            : t('leads.bulkAssignModal.selectedMulti', { count: leadIds.length })}
                        {assignAction === 'assign'
                            ? t('leads.bulkAssignModal.suffixAssign')
                            : t('leads.bulkAssignModal.suffixRotation')}
                    </p>
                </div>

                {assignAction === 'rotation' && (
                    <div className="rounded-2xl border border-teal-200/90 bg-teal-50/90 p-4 text-sm text-slate-800">
                        <p className="mb-1 flex items-center gap-2 font-bold text-teal-900">
                            <RotateCw className="h-4 w-4 shrink-0 text-teal-700" aria-hidden />
                            {t('leads.bulkAssignModal.rotationTitle')}
                        </p>
                        <p className="text-xs leading-relaxed text-slate-600">{t('leads.bulkAssignModal.rotationBody')}</p>
                    </div>
                )}

                {assignAction === 'assign' && (
                <div className="modal-card-inset space-y-2.5 border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B1828]/8 text-[#0B1828]">
                            <UserPlus className="h-3.5 w-3.5" />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">
                                {t('leads.bulkAssignModal.assignmentHeading')}
                            </h3>
                            <p className="text-[10px] font-bold uppercase tracking-tighter text-slate-600">
                                {t('leads.bulkAssignModal.assignmentSub')}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-1.5">
                            <label className="ms-1 text-[10px] font-black uppercase tracking-widest text-slate-700">
                                {t('leads.bulkAssignModal.step1Label')}
                            </label>
                            <div className="flex flex-col gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, assignmentMode: 'standard', assignedTo: '' }))}
                                    className={`rounded-xl border-2 px-3 py-2.5 text-start text-sm font-bold transition-all ${formData.assignmentMode === 'standard' ? 'border-[#BF9B30] bg-amber-50 text-[#7c5f0f]' : 'border-slate-200 bg-[#F0F4F8] text-slate-900 hover:border-[#BF9B30]/45'}`}
                                >
                                    <span className="block uppercase tracking-wide">{t('leads.bulkAssignModal.flowStandard')}</span>
                                    <span className="text-[10px] font-normal normal-case text-slate-600">{t('leads.bulkAssignModal.flowStandardHint')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData(prev => ({ ...prev, assignmentMode: 'customize', assignedTo: '' }))}
                                    disabled={!canUseCustomize}
                                    className={`rounded-xl border-2 px-3 py-2.5 text-start text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${formData.assignmentMode === 'customize' ? 'border-[#BF9B30] bg-amber-50 text-[#7c5f0f]' : 'border-slate-200 bg-[#F0F4F8] text-slate-900 hover:border-[#BF9B30]/45'}`}
                                >
                                    <span className="block uppercase tracking-wide">{t('leads.bulkAssignModal.flowCustomize')}</span>
                                    <span className="text-[10px] font-normal normal-case text-slate-600">{t('leads.bulkAssignModal.flowCustomizeHint')}</span>
                                </button>
                            </div>
                            {canUseCustomize && (
                                <p className="ms-1 text-[10px] text-foreground/50">{t('leads.bulkAssignModal.flowSwitchHint')}</p>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                {t('leads.bulkAssignModal.assignToLabel')}
                            </label>
                            <div className="relative">
                                <User className="pointer-events-none absolute start-4 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#0B1828]/40" />
                                <input
                                    type="text"
                                    value={assigneeSearch}
                                    onFocus={() => setAssigneeOpen(true)}
                                    onBlur={() => {
                                        window.setTimeout(() => setAssigneeOpen(false), 120);
                                    }}
                                    onChange={(e) => {
                                        setAssigneeSearch(e.target.value);
                                        setFormData((prev) => ({ ...prev, assignedTo: '' }));
                                        setAssigneeOpen(true);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter') return;
                                        e.preventDefault();
                                        const first = filteredAssignees[0];
                                        if (!first) return;
                                        setFormData((prev) => ({ ...prev, assignedTo: String(first.id) }));
                                        setAssigneeSearch(
                                            `${first.firstName ?? ''} ${first.lastName ?? ''} (${first.role?.displayName || first.role?.name || ''})`.trim(),
                                        );
                                        setAssigneeOpen(false);
                                    }}
                                    placeholder={t('leads.bulkAssignModal.assigneePlaceholder')}
                                    className="!h-12 !min-h-[3rem] w-full rounded-2xl border border-slate-200/90 bg-[#F0F4F8] py-2.5 ps-10 pe-3 text-xs font-bold text-[#0B1828] shadow-inner outline-none placeholder:text-slate-500 focus:border-[#0B1828] focus:ring-1 focus:ring-[#0B1828]/20"
                                />
                                {assigneeOpen && (
                                    <div className="absolute top-full z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
                                        {canBulkClearAssignment && (
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    setFormData((prev) => ({ ...prev, assignedTo: '__unassigned__' }));
                                                    setAssigneeSearch(t('leads.bulkAssignModal.optionNoAssign'));
                                                    setAssigneeOpen(false);
                                                }}
                                                className="flex w-full items-center gap-2 rounded-xl border-b border-slate-100 px-3 py-2.5 text-left text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
                                            >
                                                <User className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                                                {t('leads.bulkAssignModal.optionNoAssign')}
                                            </button>
                                        )}
                                        {filteredAssignees.length > 0 ? (
                                            filteredAssignees.map((u: any) => (
                                                <button
                                                    key={u.id}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => {
                                                        setFormData((prev) => ({ ...prev, assignedTo: String(u.id) }));
                                                        setAssigneeSearch(
                                                            `${u.firstName ?? ''} ${u.lastName ?? ''} (${u.role?.displayName || u.role?.name || ''})`.trim(),
                                                        );
                                                        setAssigneeOpen(false);
                                                    }}
                                                    className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-[#0B1828] transition-colors hover:bg-[#0B1828] hover:text-white"
                                                >
                                                    <span>
                                                        {u.firstName} {u.lastName} ({u.role?.displayName || u.role?.name})
                                                        {assigneeOpenLeadsSuffix(u)}
                                                    </span>
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-3 py-2 text-xs font-bold text-slate-500">
                                                No matching sales found
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-[#F0F4F8] p-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.useTemporaryAssignment}
                                    onChange={(e) =>
                                        setFormData({ ...formData, useTemporaryAssignment: e.target.checked })
                                    }
                                    className="rounded border-2 border-sira-border bg-sira-bg-page text-sira-gold focus:ring-secondary"
                                />
                                <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                                    <Timer className="h-3.5 w-3.5 shrink-0 text-sira-gold" />
                                    {t('leads.bulkAssignModal.timeLimitedLabel')}
                                </span>
                            </label>
                            {formData.useTemporaryAssignment && (
                                <div className="space-y-3 border-t-2 border-sira-border ps-1 pt-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">
                                            {t('leads.bulkAssignModal.durationLabel')}
                                        </label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={8760}
                                            value={formData.assignmentDurationHours}
                                            onChange={(e) =>
                                                setFormData({ ...formData, assignmentDurationHours: e.target.value })
                                            }
                                            className="modal-input rounded-xl py-2.5 px-3 text-sm font-bold text-slate-900"
                                        />
                                    </div>
                                    <p className="text-[10px] leading-relaxed text-slate-600">{t('leads.bulkAssignModal.timeLimitedExplain')}</p>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormData({ ...formData, assignmentExpireAction: 'rotation' })
                                            }
                                            className={`rounded-xl border-2 px-3 py-2 text-start text-xs font-bold transition-all ${
                                                formData.assignmentExpireAction === 'rotation'
                                                    ? 'border-teal-500/60 bg-teal-50 text-teal-900'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                            }`}
                                        >
                                            <span className="inline-flex items-center gap-2">
                                                <RotateCw className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
                                                {t('leads.bulkAssignModal.expireRotation')}
                                            </span>
                                            <span className="mt-0.5 block text-[10px] font-normal normal-case text-slate-600">
                                                {t('leads.bulkAssignModal.expireRotationHint')}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFormData({ ...formData, assignmentExpireAction: 'backup_sales' })
                                            }
                                            className={`rounded-xl border-2 px-3 py-2 text-start text-xs font-bold transition-all ${
                                                formData.assignmentExpireAction === 'backup_sales'
                                                    ? 'border-secondary/50 bg-sira-gold/15 text-sira-gold'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                            }`}
                                        >
                                            {t('leads.bulkAssignModal.expireBackup')}
                                            <span className="mt-0.5 block text-[10px] font-normal normal-case text-slate-600">
                                                {t('leads.bulkAssignModal.expireBackupHint')}
                                            </span>
                                        </button>
                                    </div>
                                    {formData.assignmentExpireAction === 'backup_sales' && (
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                                {t('leads.bulkAssignModal.backupSalesLabel')}
                                            </label>
                                            <Select
                                                value={formData.backupAssignUserId || undefined}
                                                onValueChange={(v) =>
                                                    setFormData({ ...formData, backupAssignUserId: v })
                                                }
                                            >
                                                <SelectTrigger className="!h-12 !min-h-[3rem] rounded-2xl border border-slate-200/90 bg-[#F0F4F8] px-3 py-2.5 text-xs font-bold text-slate-900 shadow-inner [&>svg]:opacity-70">
                                                    <SelectValue placeholder={t('leads.bulkAssignModal.backupPlaceholder')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {[...salesUsers]
                                                        .filter((u: any) => !excludedAssigneeIds.has(Number(u.id)))
                                                        .filter((u: any) => String(u.id) !== String(formData.assignedTo))
                                                        .sort((a, b) =>
                                                            (a.firstName || '').localeCompare(b.firstName || ''),
                                                        )
                                                        .map((u: any) => (
                                                            <SelectItem key={u.id} value={String(u.id)}>
                                                                {u.firstName} {u.lastName}
                                                                {assigneeOpenLeadsSuffix(u)}
                                                            </SelectItem>
                                                        ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-2 p-2.5 bg-sira-gold/5 rounded-xl border border-secondary/10">
                        <div className="flex items-start gap-2">
                            <ShieldCheck className="w-3 h-3 text-sira-gold mt-0.5 shrink-0" />
                            <p className="text-[10px] font-bold uppercase leading-relaxed tracking-tight text-slate-600">
                                {formData.assignmentMode === 'standard'
                                    ? t('leads.bulkAssignModal.hintStandard')
                                    : t('leads.bulkAssignModal.hintCustomize')}
                            </p>
                        </div>
                    </div>
                </div>
                )}

                <div className="modal-actions-stack">
                    <button
                        type="submit"
                        disabled={submitLoading || (assignAction === 'assign' && !formData.assignedTo)}
                        className="modal-btn-primary text-xs font-black uppercase tracking-widest"
                    >
                        {submitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {assignAction === 'rotation'
                            ? leadIds.length === 1
                                ? t('leads.bulkAssignModal.submitRotationSingle')
                                : t('leads.bulkAssignModal.submitRotationMulti', { count: leadIds.length })
                            : formData.assignedTo === '__unassigned__'
                              ? leadIds.length === 1
                                  ? t('leads.bulkAssignModal.submitClearSingle')
                                  : t('leads.bulkAssignModal.submitClearMulti', { count: leadIds.length })
                              : leadIds.length === 1
                                ? t('leads.bulkAssignModal.submitAssignSingle')
                                : t('leads.bulkAssignModal.submitAssignMulti', { count: leadIds.length })}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('leads.bulkAssignModal.cancel')}
                    </button>
                </div>
            </form>
            <Modal
                isOpen={rotationBlockedLeads.length > 0}
                onClose={() => !rotationForceSubmitting && setRotationBlockedLeads([])}
                title={t('leads.bulkAssignModal.confirmRotationTitle')}
                subtitle={t('leads.bulkAssignModal.confirmRotationSubtitle')}
                size="lg"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-400/60 bg-amber-50 text-amber-900 shadow-sm">
                        <AlertTriangle className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200/90 bg-amber-50/95 p-3 text-sm text-slate-900">
                        <p className="inline-flex items-center gap-2 font-bold text-amber-900">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                            {t('leads.bulkAssignModal.confirmRotationWarning')}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{t('leads.bulkAssignModal.confirmRotationBody')}</p>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-slate-200/90 bg-[#F0F4F8]/80 p-2">
                        {rotationBlockedLeads.map((lead) => (
                            <div key={lead.id} className="rounded-lg border border-slate-200/90 bg-white px-3 py-2 text-xs">
                                <p className="font-bold text-slate-900">{lead.name}</p>
                                <p className="text-slate-600">
                                    {t('leads.bulkAssignModal.confirmSalesLine', {
                                        name: lead.assignedSales?.name ?? t('leads.bulkAssignModal.unassignedLabel'),
                                    })}
                                </p>
                                <p className="text-slate-600">
                                    {t('leads.bulkAssignModal.confirmMeetingsFeedback', {
                                        meetings: lead.meetingsCount,
                                        feedback: lead.feedbacksCount,
                                    })}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="modal-actions-stack">
                        <button
                            type="button"
                            disabled={rotationForceSubmitting}
                            onClick={forceSendBlockedToRotation}
                            className="modal-btn-primary text-xs font-black uppercase tracking-wide"
                        >
                            {rotationForceSubmitting
                                ? t('leads.bulkAssignModal.confirmMoving')
                                : t('leads.bulkAssignModal.confirmYes')}
                        </button>
                        <button
                            type="button"
                            disabled={rotationForceSubmitting}
                            onClick={() => setRotationBlockedLeads([])}
                            className="modal-btn-secondary text-xs font-bold"
                        >
                            {t('leads.bulkAssignModal.confirmNo')}
                        </button>
                    </div>
                </div>
            </Modal>
        </Modal>
    );
}

