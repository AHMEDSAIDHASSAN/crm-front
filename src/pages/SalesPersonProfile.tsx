import { useEffect, useState, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    UserCircle,
    Users,
    Calendar,
    TrendingUp,
    Phone,
    Mail,
    Briefcase,
    MapPin,
    MessageSquare,
    FileText,
    Play,
    Loader2,
    Eye,
    Clock3,
    Shield,
    Filter,
    RotateCw,
    CheckSquare,
    Square,
    UserPlus,
} from 'lucide-react';
import {
    getUserSalesOverview,
    getMeetings,
    getUser,
    getMeeting,
    updateMeeting,
    getAllLeads,
    getHrEmployeeProfile,
    bulkSendLeadsToRotation,
    getAllDataBatches,
} from '../services/api';

import { formatMoney } from '../lib/currency';
import EndMeetingFeedbackModal from '../components/meetings/EndMeetingFeedbackModal';
import MeetingLocationsMap from '../components/meetings/MeetingLocationsMap';
import Modal from '../components/ui/Modal';
import BulkAssignModal from '../components/leads/BulkAssignModal';
import { toast } from '../lib/toast';
import { coordsToMeetingString, getMeetingGpsPosition } from '../utils/meetingGeolocation';
import { formatPhoneWithCountryCode } from '../utils/phone';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/Store';
import { useTranslation } from 'react-i18next';
import { getCanonicalRoleName, getRoleDisplayName } from '../lib/userRole';
import { dataBatchMarketingLabel } from '../lib/dataBatchDisplay';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';

function formatLeadStatus(status: string) {
    return String(status || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Funnel-friendly order for personnel profile status chips (matches backend LeadStatus). */
const PROFILE_LEADS_STATUS_SORT: readonly string[] = [
    'new_lead',
    'cold_call',
    'follow_up',
    'qualified',
    'no_answer',
    'wrong_number',
    'not_interested',
    'switched_off',
    'meeting_cancelled',
    'purchased',
    'assigned',
    'rotation',
];

function sortProfileLeadStatusKeys(map: Record<string, number>): string[] {
    const keys = Object.keys(map || {});
    const rank = (s: string) => {
        const i = PROFILE_LEADS_STATUS_SORT.indexOf(s);
        return i === -1 ? 999 : i;
    };
    return keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function LeadStatusBadge({ status }: { status: string }) {
    const s = String(status || '');
    const tone =
        s === 'converted' || s === 'purchased'
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            : s === 'lost' || s === 'not_interested'
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : s === 'qualified' || s === 'interested'
                    ? 'bg-sira-gold/15 text-sira-gold border-secondary/30'
                    : 'bg-foreground/10 text-foreground/70 border-foreground/15';
    return (
        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${tone}`}>
            {formatLeadStatus(s)}
        </span>
    );
}

function meetingStatusLabel(s: string) {
    return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseLatLng(value: string | null | undefined): { lat: number; lng: number } | null {
    if (!value) return null;
    const parts = String(value).split(',').map((p) => Number(p.trim()));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    const [lat, lng] = parts;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

function mapsQueryUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Same as Leads list: blur middle digits for sales privacy when viewing own assigned list. */
function SalesListPhone({ phone, className }: { phone?: string | null; className?: string }) {
    const f = formatPhoneWithCountryCode(phone);
    if (!f || f.length <= 9) {
        return (
            <span className={className} dir="ltr">
                {f}
            </span>
        );
    }
    const head = 4;
    const tail = 3;
    if (f.length <= head + tail) {
        return (
            <span className={className} dir="ltr">
                {f}
            </span>
        );
    }
    const mid = f.slice(head, -tail);
    return (
        <span className={className} dir="ltr">
            {f.slice(0, head)}
            <span className="inline-block min-w-[1.5ch] select-none blur-[3.5px] opacity-80" aria-hidden>
                {mid}
            </span>
            {f.slice(-tail)}
        </span>
    );
}

type ProfileAssignedLeadsProps = {
    profileDisplayName: string;
    rows: any[];
    meta: any;
    page: number;
    setPage: Dispatch<SetStateAction<number>>;
    tableLoading: boolean;
    listLoading: boolean;
    canViewLeadDetails: boolean;
    onManageView: (l: any) => void;
    /** Counts for chips (same window as performance range KPI). */
    leadsByStatus: Record<string, number>;
    kpiAssignedTotal: number;
    statusFilter: string | null;
    onStatusFilterChange: (status: string | null) => void;
    canManageAsAdminOrOM: boolean;
    selectedLeadIds: number[];
    toggleLeadSelection: (id: number) => void;
    toggleAllLeads: () => void;
    onBulkRotation: () => void;
    onIndividualRotation: (l: any) => void;
    rotatingLeadId: number | null;
    /** Batch filter + bulk selection tools (admin / OM). */
    assignedLeadDataBatchId: string;
    onAssignedLeadDataBatchIdChange: (id: string) => void;
    profileDataBatches: any[];
    showLeadToolbar: boolean;
    profileSelectionTargetCount: string;
    onProfileSelectionTargetCountChange: (v: string) => void;
    onProfileApplySelectionCount: () => void;
    profileSelectionByCountLoading: boolean;
    onOpenReassignModal: () => void;
    /** Hide floating bar while bulk reassign modal is open (same pattern as Leads). */
    reassignModalOpen: boolean;
    /** When true, assigned-lead phones use blurred middle (sales viewing own profile). */
    blurAssignedLeadPhones: boolean;
};

/** Assigned-leads table: current assignee only (from leads list API). */
function profileStatusChipTone(status: string): string {
    const s = String(status || '');
    if (s === 'purchased') return 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300';
    if (s === 'rotation') return 'border-sira-border bg-sira-bg-subtle text-sira-text-muted';
    if (s === 'not_interested' || s === 'wrong_number') return 'border-red-500/30 bg-red-500/[0.07] text-red-700 dark:text-red-300';
    if (s === 'qualified' || s === 'follow_up') return 'border-sira-gold/40 bg-sira-gold/10 text-sira-brown';
    return 'border-sira-border/80 bg-white/60 dark:bg-white/[0.04] text-sira-text-secondary';
}

function ProfileAssignedLeadsCard({
    profileDisplayName,
    rows,
    meta,
    page,
    setPage,
    tableLoading,
    listLoading,
    canViewLeadDetails,
    onManageView,
    leadsByStatus,
    kpiAssignedTotal,
    statusFilter,
    onStatusFilterChange,
    canManageAsAdminOrOM,
    selectedLeadIds,
    toggleLeadSelection,
    toggleAllLeads,
    onBulkRotation,
    onIndividualRotation,
    rotatingLeadId,
    assignedLeadDataBatchId,
    onAssignedLeadDataBatchIdChange,
    profileDataBatches,
    showLeadToolbar,
    profileSelectionTargetCount,
    onProfileSelectionTargetCountChange,
    onProfileApplySelectionCount,
    profileSelectionByCountLoading,
    onOpenReassignModal,
    reassignModalOpen,
    blurAssignedLeadPhones,
}: ProfileAssignedLeadsProps) {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language?.toLowerCase().startsWith('ar');
    const hasRows = rows.length > 0;
    const statusKeys = sortProfileLeadStatusKeys(leadsByStatus || {});

    return (
        <>
        <div
            id="profile-all-leads"
            className="rounded-[32px] border border-sira-border bg-sira-bg-card p-8 md:p-10 shadow-premium scroll-mt-32 ring-1 ring-black/[0.02] dark:ring-white/[0.04]"
        >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6 border-b border-sira-border/50">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.35)]" />
                    <div className="min-w-0 space-y-1">
                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted">
                            {t('salesProfile.assignedLeads')}
                        </h2>
                        <p className="text-[10px] font-bold text-sira-text-muted/90 leading-relaxed max-w-xl">
                            {t('salesProfile.statusCountsHint')}
                        </p>
                    </div>
                </div>
                <div
                    className={`shrink-0 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest tabular-nums text-center sm:text-end ${statusFilter
                            ? 'border-sira-gold/40 bg-sira-gold/10 text-sira-brown'
                            : 'border-sira-border bg-sira-bg-subtle text-sira-text-primary'
                        }`}
                >
                    {statusFilter ? (
                        <>
                            <span className="block text-[9px] text-sira-text-muted font-black tracking-[0.15em] mb-0.5">
                                {formatLeadStatus(statusFilter)}
                            </span>
                            {meta?.total ?? 0} {t('salesProfile.inList')}
                        </>
                    ) : (
                        <>
                            <span className="block text-[9px] text-sira-text-muted font-black tracking-[0.15em] mb-0.5">
                                {t('salesProfile.allStatuses')}
                            </span>
                            {kpiAssignedTotal} {t('salesProfile.inRange')}
                        </>
                    )}
                </div>
            </div>

            <div
                className={`mb-8 rounded-[24px] border border-sira-border/70 bg-gradient-to-br from-sira-bg-subtle via-white/40 to-sira-bg-subtle/30 dark:from-sira-bg-subtle dark:via-white/[0.03] dark:to-sira-bg-subtle p-4 md:p-5 shadow-inner ${listLoading ? 'opacity-70 pointer-events-none' : ''}`}
            >
                <div className={`flex items-center gap-2 mb-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                    <Filter className="w-3.5 h-3.5 text-sira-gold shrink-0" aria-hidden />
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted">{t('salesProfile.leadsByStatus')}</p>
                </div>
                <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('salesProfile.filterByStatus')}>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={statusFilter == null}
                        onClick={() => onStatusFilterChange(null)}
                        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sira-gold/50 ${statusFilter == null
                                ? 'border-sira-brown bg-sira-brown text-white shadow-md scale-[1.02]'
                                : 'border-sira-border bg-white/80 dark:bg-white/[0.06] text-sira-text-primary hover:border-sira-gold/50 hover:bg-white dark:hover:bg-white/[0.08]'
                            }`}
                    >
                        <span className="text-[10px] font-black uppercase tracking-tight">{t('salesProfile.allStatuses')}</span>
                        <span
                            className={`tabular-nums text-[11px] font-black rounded-lg px-1.5 py-0.5 ${statusFilter == null ? 'bg-white/20' : 'bg-sira-bg-subtle text-sira-gold'
                                }`}
                        >
                            {kpiAssignedTotal}
                        </span>
                    </button>
                    {statusKeys.map((st) => {
                        const n = leadsByStatus[st] ?? 0;
                        const active = statusFilter === st;
                        return (
                            <button
                                key={st}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => onStatusFilterChange(st)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sira-gold/50 ${active
                                        ? 'border-sira-brown bg-sira-brown text-white shadow-md ring-2 ring-sira-gold/25 scale-[1.02]'
                                        : `${profileStatusChipTone(st)} hover:brightness-[0.98] dark:hover:brightness-110`
                                    }`}
                            >
                                <span className="text-[10px] font-black uppercase tracking-tight leading-tight max-w-[140px] truncate">
                                    {formatLeadStatus(st)}
                                </span>
                                <span
                                    className={`tabular-nums text-[11px] font-black rounded-lg px-1.5 py-0.5 shrink-0 ${active ? 'bg-white/20 text-white' : 'bg-black/[0.06] dark:bg-white/10 text-sira-text-primary'
                                        }`}
                                >
                                    {n}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {showLeadToolbar && (
                <div
                    className={`mb-6 rounded-[24px] border border-sira-border/70 bg-sira-bg-subtle/40 p-4 md:p-5 space-y-4 ${listLoading ? 'opacity-70 pointer-events-none' : ''}`}
                >
                    <div className={`flex flex-col lg:flex-row lg:items-end gap-4 ${isRtl ? 'lg:flex-row-reverse' : ''}`}>
                        <div className="flex-1 space-y-2 min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted">
                                {t('leads.specificBatch')}
                            </p>
                            <Select
                                value={assignedLeadDataBatchId ? assignedLeadDataBatchId : '__all__'}
                                onValueChange={(v) => onAssignedLeadDataBatchIdChange(v === '__all__' ? '' : v)}
                            >
                                <SelectTrigger className="h-11 w-full max-w-md rounded-xl bg-white border-sira-border text-[10px] font-black uppercase tracking-tight text-sira-text-primary shadow-sm">
                                    <SelectValue placeholder={t('leads.specificBatch')} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-sira-border shadow-xl max-h-72">
                                    <SelectItem value="__all__">
                                        {t('salesProfile.allBatches', { defaultValue: 'All batches' })}
                                    </SelectItem>
                                    {[...(profileDataBatches || [])]
                                        .filter((b: any) => Number(b._count?.leads ?? 0) > 0)
                                        .sort((a: any, b: any) =>
                                            String(a.batchName ?? '').localeCompare(String(b.batchName ?? '')),
                                        )
                                        .map((batch: any) => {
                                            const batchValue = String(batch.id);
                                            const leadN = Number(batch._count?.leads ?? 0);
                                            return (
                                                <SelectItem key={batchValue} value={batchValue}>
                                                    <span className="flex flex-col gap-0.5 text-start">
                                                        <span>
                                                            {batch.batchName || `#${batchValue}`}{' '}
                                                            <span className="tabular-nums opacity-80">({leadN.toLocaleString()})</span>
                                                        </span>
                                                        <span className="text-[9px] font-bold normal-case tracking-normal text-sira-text-muted">
                                                            {dataBatchMarketingLabel(batch.dataSource, t)}
                                                        </span>
                                                    </span>
                                                </SelectItem>
                                            );
                                        })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted">
                                    {t('leads.selectionCount', { defaultValue: 'Selection count' })}
                                </p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={profileSelectionTargetCount}
                                        onChange={(e) => onProfileSelectionTargetCountChange(e.target.value.replace(/[^\d]/g, ''))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (!profileSelectionByCountLoading) onProfileApplySelectionCount();
                                            }
                                        }}
                                        className="h-11 w-24 rounded-xl border border-sira-border bg-white px-2 text-center text-[11px] font-black text-sira-text-primary outline-none focus:border-sira-gold"
                                        placeholder={t('leads.count', { defaultValue: 'Count' })}
                                        disabled={profileSelectionByCountLoading}
                                        aria-label={t('leads.selectionCount', { defaultValue: 'Selection count' })}
                                    />
                                    {profileSelectionByCountLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin text-sira-gold" aria-hidden />
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={onProfileApplySelectionCount}
                                        disabled={profileSelectionByCountLoading}
                                        className="h-11 px-4 rounded-xl bg-sira-bg-subtle border border-sira-border text-[10px] font-black uppercase tracking-widest text-sira-brown hover:bg-sira-gold/15 transition-colors disabled:opacity-50"
                                    >
                                        {t('leads.apply', { defaultValue: 'Apply' })}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tableLoading ? (
                <p className="text-foreground/40 text-sm py-4">{t('salesProfile.loadingLeads')}</p>
            ) : !hasRows ? (
                <p className="text-foreground/40 text-sm py-4">
                    {statusFilter
                        ? t('salesProfile.noLeadsForStatus', { status: formatLeadStatus(statusFilter) })
                        : t('salesProfile.noAssignedLeads', { name: profileDisplayName })}
                </p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-sira-border" dir={isRtl ? 'rtl' : 'ltr'}>
                    <table className={`w-full text-xs ${isRtl ? 'text-right' : 'text-left'}`}>
                        <thead>
                            <tr className="bg-sira-bg-subtle text-sira-text-muted uppercase text-[9px] font-black tracking-[0.25em]">
                                {canManageAsAdminOrOM && (
                                    <th className="py-4 px-6 text-start w-10">
                                        <button
                                            onClick={toggleAllLeads}
                                            className="text-sira-gold hover:scale-110 transition-transform"
                                        >
                                            {rows.length > 0 && rows.every(r => selectedLeadIds.includes(Number(r.id))) ? (
                                                <CheckSquare className="w-4 h-4" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </th>
                                )}
                                <th className="py-4 px-6 text-start ">{t('salesProfile.lead')}</th>
                                <th className="py-4 px-6 text-start ">{t('salesProfile.phone')}</th>
                                <th className="py-4 px-6 text-start ">{t('salesProfile.team')}</th>
                                <th className="py-4 px-6 text-start ">{t('salesProfile.status')}</th>
                                <th className="py-4 px-6 text-start ">{t('salesProfile.priority')}</th>
                                <th className="py-4 px-6 text-start ">{t('salesProfile.updated')}</th>
                                <th className={`py-4 px-6 ${isRtl ? 'text-left' : 'text-right'}`}>
                                    {t('common.actions', { defaultValue: 'Actions' })}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-sira-border/30">
                            {rows.map((l: any) => {
                                const leadId = Number(l.id);
                                const isSelected = selectedLeadIds.includes(leadId);
                                const isRotating = rotatingLeadId === leadId;

                                return (
                                    <tr key={String(l.id)} className={`group transition-colors ${isSelected ? 'bg-sira-gold/5' : 'hover:bg-sira-bg-hover'}`}>
                                        {canManageAsAdminOrOM && (
                                            <td className="py-4 px-6">
                                                <button
                                                    onClick={() => toggleLeadSelection(leadId)}
                                                    className={`transition-all ${isSelected ? 'text-sira-gold' : 'text-sira-text-muted/40 hover:text-sira-gold/60'}`}
                                                >
                                                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                </button>
                                            </td>
                                        )}
                                        <td className="py-4 px-6 text-sira-text-primary font-black uppercase tracking-tight text-[11px] min-w-0">
                                            <div className="space-y-0.5 min-w-0">
                                                <p className="whitespace-nowrap truncate">
                                                    {[l.firstName, l.lastName].filter(Boolean).join(' ') || '—'}
                                                </p>
                                                {l.dataBatch?.batchName ? (
                                                    <p
                                                        className="max-w-[14rem] truncate text-[9px] font-semibold normal-case tracking-normal text-sira-text-muted"
                                                        title={String(l.dataBatch.batchName)}
                                                    >
                                                        {t('leads.dataBatch')}: {l.dataBatch.batchName}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-sira-text-secondary text-[11px] font-bold tabular-nums">
                                            {l.phone == null || l.phone === '' ? (
                                                '—'
                                            ) : blurAssignedLeadPhones ? (
                                                <SalesListPhone phone={l.phone} className="text-[11px] font-black text-sira-text-secondary" />
                                            ) : (
                                                <span dir="ltr">{formatPhoneWithCountryCode(l.phone)}</span>
                                            )}
                                        </td>
                                        <td className="py-4 px-6 text-sira-text-secondary text-[11px] font-bold capitalize">{l.team?.name ?? '—'}</td>
                                        <td className="py-4 px-6">
                                            <LeadStatusBadge status={l.status} />
                                        </td>
                                        <td className="py-4 px-6 text-sira-text-secondary text-[11px] font-bold capitalize ">{l.priority ?? '—'}</td>
                                        <td className="py-4 px-6 text-sira-text-muted text-[10px] font-black uppercase tracking-tight whitespace-nowrap">
                                            {l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : '—'}
                                        </td>
                                        <td className={`py-4 px-6 whitespace-nowrap space-x-2 ${isRtl ? 'text-left flex-row-reverse' : 'text-right'}`}>
                                            {canManageAsAdminOrOM && (
                                                <button
                                                    type="button"
                                                    disabled={isRotating}
                                                    onClick={() => onIndividualRotation(l)}
                                                    title={t('leads.sendToRotation', { defaultValue: 'Send to Rotation' })}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border hover:bg-sira-brown hover:text-white transition-all shadow-sm group/btn disabled:opacity-50"
                                                >
                                                    {isRotating ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <RotateCw className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                            {canViewLeadDetails && (
                                                <button
                                                    type="button"
                                                    onClick={() => onManageView(l)}
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border hover:bg-sira-gold hover:text-white transition-all shadow-sm group/btn"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {meta?.totalPages > 1 && hasRows && (
                <div className="mt-5 flex flex-wrap items-center justify-end gap-2 text-[10px] text-foreground/50">
                    <span className="tabular-nums mr-auto">
                        {t('salesProfile.pageOf', { page: meta.page, totalPages: meta.totalPages || 1, total: meta.total })}
                    </span>
                    <button
                        type="button"
                        disabled={page <= 1 || listLoading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-2 rounded-lg bg-foreground/10 text-xs font-bold text-foreground disabled:opacity-40"
                    >
                        {t('salesProfile.prev')}
                    </button>
                    <button
                        type="button"
                        disabled={page >= (meta.totalPages || 1) || listLoading}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3 py-2 rounded-lg bg-foreground/10 text-xs font-bold text-foreground disabled:opacity-40"
                    >
                        {t('salesProfile.next')}
                    </button>
                </div>
            )}
        </div>

        <AnimatePresence>
            {canManageAsAdminOrOM && selectedLeadIds.length > 0 && !reassignModalOpen && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    role="toolbar"
                    aria-label={t('salesProfile.selectionActions', {
                        defaultValue: 'Selection: count, reassign, send to rotation',
                    })}
                    className={`fixed bottom-6 left-1/2 z-50 flex w-[min(94vw,28rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-sira-border bg-sira-bg-card px-4 py-3 shadow-[0_20px_50px_rgba(11,24,40,0.18)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] ${isRtl ? 'flex-row-reverse' : 'flex-row'}`}
                >
                    <input
                        type="text"
                        inputMode="numeric"
                        value={profileSelectionTargetCount}
                        onChange={(e) => onProfileSelectionTargetCountChange(e.target.value.replace(/[^\d]/g, ''))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!profileSelectionByCountLoading) onProfileApplySelectionCount();
                            }
                        }}
                        className="h-11 w-[5.5rem] shrink-0 rounded-xl border border-sira-border bg-sira-bg-subtle px-2 text-center text-[12px] font-black tabular-nums text-sira-text-primary outline-none focus:border-sira-gold"
                        placeholder={t('leads.count', { defaultValue: 'Count' })}
                        disabled={profileSelectionByCountLoading}
                        aria-label={t('leads.selectionCount', { defaultValue: 'Selection count' })}
                        title={t('salesProfile.selectionCountHint', {
                            defaultValue: 'Enter a number and press Enter to select that many leads from the list (filters apply).',
                        })}
                    />
                    {profileSelectionByCountLoading ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sira-gold" aria-hidden />
                    ) : null}
                    <button
                        type="button"
                        onClick={onOpenReassignModal}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-sira-gold bg-sira-gold px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-[#0B1828] shadow-sm transition-all hover:bg-sira-brown hover:text-white sm:min-w-0 sm:flex-initial sm:px-5"
                    >
                        <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('salesProfile.reassignLeads', { defaultValue: 'Reassign' })}
                    </button>
                    <button
                        type="button"
                        onClick={onBulkRotation}
                        disabled={rotatingLeadId === -1}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-sira-border bg-sira-brown px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white shadow-sm transition-all hover:bg-sira-brown-dark disabled:opacity-50 sm:min-w-0 sm:flex-initial sm:px-5"
                    >
                        {rotatingLeadId === -1 ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                        ) : (
                            <RotateCw className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        {t('leads.bulkRotation', { defaultValue: 'Send to Rotation' })}
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}

/** Meetings list page size */
const PAGE_SIZE = 10;
/** Load essentially all leads currently assigned to this profile (single view) */
const PROFILE_ASSIGNED_LEADS_LIMIT = 200;

const emptyLeadsPage = (limit: number) => ({
    data: [] as any[],
    meta: { page: 1, total: 0, totalPages: 0, limit },
});

const emptyPerformance = () => ({
    assignedLeadsTotal: 0,
    leadsByStatus: {} as Record<string, number>,
    meetingsTotal: 0,
    meetingsCompleted: 0,
    meetingsOpen: 0,
    conversionRate: 0,
    salesWeek: 0,
    salesMonth: 0,
});

/** API may return { user, performance, ... } or a flat user (e.g. profile without query). */
function pickUserAndPerformance(overview: any): { user: any | null; performance: ReturnType<typeof emptyPerformance> } {
    if (!overview || typeof overview !== 'object') {
        return { user: null, performance: emptyPerformance() };
    }
    if (overview.user != null && typeof overview.user === 'object') {
        return {
            user: overview.user,
            performance:
                overview.performance && typeof overview.performance === 'object'
                    ? { ...emptyPerformance(), ...overview.performance }
                    : emptyPerformance(),
        };
    }
    if (overview.id != null && (overview.email != null || overview.firstName != null || overview.lastName != null)) {
        return {
            user: overview,
            performance: emptyPerformance(),
        };
    }
    return { user: null, performance: emptyPerformance() };
}

/** Consistent locale + 24h for Arabic to avoid confusing AM/PM next to scheduled times. */
function formatMeetingDateTime(value: string | null | undefined, language: string): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    const ar = language.startsWith('ar');
    return d.toLocaleString(ar ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: !ar,
    });
}

export default function SalesPersonProfile() {
    const { t, i18n } = useTranslation();
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const currentUser = useSelector((state: RootState) => state.user.user);
    const roleName = getCanonicalRoleName(currentUser);
    const canViewOthers = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);
    const canManageAsAdminOrOM = roleName === 'super_admin' || roleName === 'operation_manager';
    const canViewLeadDetails = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);

    /** Sales KPI payload from /auth/profile?memberSalesUserId= */
    const [overviewPayload, setOverviewPayload] = useState<any>(null);
    /** Prefer GET /users/:id when allowed — always has name, email, role, team. */
    const [identityUser, setIdentityUser] = useState<any>(null);
    const [meetingsPage, setMeetingsPage] = useState(1);
    const [meetingsData, setMeetingsData] = useState<any>(null);
    const [currentAssignedLeadsPage, setCurrentAssignedLeadsPage] = useState(1);
    /** Filter assigned-leads table by lead status (GET /leads `status`). */
    const [assignedLeadStatusFilter, setAssignedLeadStatusFilter] = useState<string | null>(null);
    /** Paginated leads for this profile (current assignee filter). */
    const [assignedLeadsListPayload, setAssignedLeadsListPayload] = useState<any>(null);
    const [profileLeadsLoading, setProfileLeadsLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const hasLoadedOverviewRef = useRef(false);
    const [meetingToEnd, setMeetingToEnd] = useState<any>(null);
    const [detailMeeting, setDetailMeeting] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [startingMeetingId, setStartingMeetingId] = useState<number | null>(null);
    const [performanceRange, setPerformanceRange] = useState<'all' | 'week' | 'month' | 'year'>('all');
    const [currentTab, setCurrentTab] = useState<'sales' | 'hr' | 'finance' | 'performance'>('sales');
    const [hrData, setHrData] = useState<any>(null);
    const [hrLoading, setHrLoading] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
    const [rotatingLeadId, setRotatingLeadId] = useState<number | null>(null);
    const [reassignModalOpen, setReassignModalOpen] = useState(false);
    const [profileDataBatches, setProfileDataBatches] = useState<any[]>([]);
    const [assignedLeadDataBatchId, setAssignedLeadDataBatchId] = useState('');
    const [profileSelectionTargetCount, setProfileSelectionTargetCount] = useState('');
    const [profileSelectionByCountLoading, setProfileSelectionByCountLoading] = useState(false);
    const [meetingsFrom, setMeetingsFrom] = useState('');
    const [meetingsTo, setMeetingsTo] = useState('');

    const numericId = userId && /^\d+$/.test(userId) ? userId : null;

    const loadOverview = useCallback(async () => {
        if (!numericId) return;
        const firstPaint = !hasLoadedOverviewRef.current;
        if (firstPaint) setLoading(true);
        else setProfileLeadsLoading(true);
        const assigneeParam = String(numericId);
        try {
            const overviewPromise = getUserSalesOverview(numericId, null, performanceRange);
            const userRowPromise = canViewOthers
                ? getUser(numericId).catch(() => null)
                : Promise.resolve(null);
            const leadListParams: Record<string, string> = { assignedTo: assigneeParam };
            if (assignedLeadStatusFilter) {
                leadListParams.status = assignedLeadStatusFilter;
            }
            if (assignedLeadDataBatchId) {
                leadListParams.dataBatchId = assignedLeadDataBatchId;
            }
            const assignedLeadsPromise = getAllLeads(
                currentAssignedLeadsPage,
                PROFILE_ASSIGNED_LEADS_LIMIT,
                leadListParams,
            ).catch((e: any) => {
                const st = e?.response?.status;
                if (st && st !== 403) {
                    toast.error(e?.response?.data?.message || t('salesProfile.couldNotLoadAssignedLeads'));
                }
                return emptyLeadsPage(PROFILE_ASSIGNED_LEADS_LIMIT);
            });
            const [ov, userRow, assignedLeads] = await Promise.all([
                overviewPromise,
                userRowPromise,
                assignedLeadsPromise,
            ]);
            setOverviewPayload(ov);
            setAssignedLeadsListPayload(assignedLeads);
            const fromOverview = pickUserAndPerformance(ov).user;
            setIdentityUser(userRow ?? fromOverview);
            hasLoadedOverviewRef.current = true;
        } catch (e: any) {
            const msg = e.response?.status === 403 ? t('salesProfile.cannotViewProfile') : t('salesProfile.failedLoadProfile');
            toast.error(msg);
            navigate(-1);
        } finally {
            setLoading(false);
            setProfileLeadsLoading(false);
        }
    }, [numericId, navigate, canViewOthers, currentAssignedLeadsPage, performanceRange, assignedLeadStatusFilter, assignedLeadDataBatchId]);

    const loadHrProfile = useCallback(async () => {
        if (!numericId) return;
        setHrLoading(true);
        try {
            const res = await getHrEmployeeProfile(numericId);
            setHrData(res);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to load HR details');
        } finally {
            setHrLoading(false);
        }
    }, [numericId]);

    const loadMeetings = useCallback(async (page: number) => {
        if (!numericId) return;
        try {
            const data = await getMeetings(page, PAGE_SIZE, { userId: numericId });
            setMeetingsData(data);
        } catch {
            setMeetingsData({ data: [], meta: { page: 1, total: 0, totalPages: 0, limit: PAGE_SIZE } });
        }
    }, [numericId]);

    const refreshLists = useCallback(() => {
        if (!numericId) return;
        loadOverview();
        loadMeetings(meetingsPage);
    }, [numericId, loadOverview, loadMeetings, meetingsPage]);

    const handleAssignedLeadStatusFilterChange = useCallback((status: string | null) => {
        setAssignedLeadStatusFilter(status);
        setCurrentAssignedLeadsPage(1);
    }, []);

    const handleStartMeeting = useCallback(
        async (meeting: any) => {
            const id = Number(meeting.id);
            setStartingMeetingId(id);
            try {
                if (!navigator.geolocation) {
                    toast.error(t('salesProfile.geoNotSupported'));
                    return;
                }
                let currentLocation: string;
                try {
                    const pos = await getMeetingGpsPosition();
                    currentLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
                } catch (e: any) {
                    const code = e?.code;
                    if (code === 1) toast.error(t('salesProfile.locationPermissionDenied'));
                    else if (code === 2) toast.error(t('salesProfile.locationUnavailable'));
                    else if (code === 3) toast.error(t('salesProfile.locationTimedOut'));
                    else toast.error(t('salesProfile.couldNotReadGps'));
                    return;
                }
                await updateMeeting(id, {
                    status: 'in_progress',
                    startedAt: new Date().toISOString(),
                    currentLocation,
                });
                toast.success(t('salesProfile.meetingStartedWithLocation'));
                await loadMeetings(meetingsPage);
                await loadOverview();
            } catch (e: any) {
                toast.error(e.response?.data?.message || t('salesProfile.failedStartMeeting'));
            } finally {
                setStartingMeetingId(null);
            }
        },
        [loadMeetings, loadOverview, meetingsPage],
    );

    const toggleLeadSelection = useCallback((id: number) => {
        setSelectedLeadIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    }, []);

    const toggleAllLeads = useCallback(() => {
        const currentRows = assignedLeadsListPayload?.data ?? [];
        const currentPageIds = currentRows.map((r: any) => Number(r.id));
        const allSelected = currentPageIds.every((id: number) => selectedLeadIds.includes(id));

        if (allSelected) {
            setSelectedLeadIds((prev) => prev.filter((id) => !currentPageIds.includes(id)));
        } else {
            setSelectedLeadIds((prev) => {
                const next = [...prev];
                currentPageIds.forEach((id: number) => {
                    if (!next.includes(id)) next.push(id);
                });
                return next;
            });
        }
    }, [assignedLeadsListPayload, selectedLeadIds]);

    const handleRotation = useCallback(async (ids: number[]) => {
        if (!ids.length) return;
        try {
            setRotatingLeadId(ids.length === 1 ? ids[0] : -1);
            await bulkSendLeadsToRotation({ leadIds: ids });
            toast.success(t('leads.rotationRowSuccess', { defaultValue: 'Leads sent to rotation successfully' }));
            setSelectedLeadIds([]);
            loadOverview();
        } catch (error: any) {
            const payload = error?.response?.data;
            if (payload?.code === 'ROTATION_CONFIRM_REQUIRED') {
                const ok = window.confirm(t('leads.rotationRowConfirmEngaged', { defaultValue: 'Some leads are already engaged. Force rotation?' }));
                if (ok) {
                    try {
                        await bulkSendLeadsToRotation({ leadIds: ids, force: true });
                        toast.success(t('leads.rotationRowSuccess', { defaultValue: 'Leads sent to rotation successfully' }));
                        setSelectedLeadIds([]);
                        loadOverview();
                    } catch (e2: any) {
                        toast.error(e2?.response?.data?.message || t('leads.rotationRowFail', { defaultValue: 'Failed to send leads to rotation' }));
                    }
                }
            } else {
                toast.error(payload?.message || t('leads.rotationRowFail', { defaultValue: 'Failed to send leads to rotation' }));
            }
        } finally {
            setRotatingLeadId(null);
        }
    }, [loadOverview, t]);

    const handleIndividualRotation = useCallback((lead: any) => {
        handleRotation([Number(lead.id)]);
    }, [handleRotation]);

    const handleBulkRotation = useCallback(() => {
        handleRotation(selectedLeadIds);
    }, [handleRotation, selectedLeadIds]);

    const handleAssignedLeadDataBatchChange = useCallback((id: string) => {
        setAssignedLeadDataBatchId(id);
        setCurrentAssignedLeadsPage(1);
    }, []);

    const applyProfileSelectionByCount = useCallback(async () => {
        const cleaned = String(profileSelectionTargetCount || '').replace(/[^\d]/g, '');
        const raw = Number(cleaned);
        if (!Number.isFinite(raw) || raw <= 0) {
            toast.error(t('leads.invalidSelectionCount', { defaultValue: 'Enter a valid selection count' }));
            return;
        }
        if (!numericId) return;
        setProfileSelectionByCountLoading(true);
        try {
            const leadListParams: Record<string, string> = { assignedTo: String(numericId) };
            if (assignedLeadStatusFilter) leadListParams.status = assignedLeadStatusFilter;
            if (assignedLeadDataBatchId) leadListParams.dataBatchId = assignedLeadDataBatchId;
            const target = Math.max(1, Math.floor(raw));
            const res = await getAllLeads(1, Math.min(target, 500), leadListParams);
            const items = Array.isArray(res?.data) ? res.data : [];
            if (items.length === 0) {
                toast.info(t('leads.noLeadsToSelect', { defaultValue: 'No leads loaded to select' }));
                return;
            }
            const finalTarget = Math.min(target, items.length);
            const targetIds = items.slice(0, finalTarget).map((l: any) => Number(l.id));
            setSelectedLeadIds(Array.from(new Set(targetIds)));
            if (finalTarget < target) {
                toast.info(
                    t('leads.selectedCountPartial', {
                        defaultValue: `Loaded and selected ${finalTarget} lead(s) (requested ${target})`,
                        count: finalTarget,
                        requested: target,
                    }),
                );
            } else {
                toast.success(
                    t('leads.selectedCountApplied', {
                        defaultValue: `Loaded and selected ${finalTarget} lead(s)`,
                        count: finalTarget,
                    }),
                );
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.message || t('salesProfile.couldNotLoadAssignedLeads'));
        } finally {
            setProfileSelectionByCountLoading(false);
        }
    }, [
        numericId,
        assignedLeadStatusFilter,
        assignedLeadDataBatchId,
        profileSelectionTargetCount,
        t,
    ]);

    const profileHeaderRef = useRef<HTMLDivElement>(null);
    /** Only scroll profile header into view once per agent; refetches (filters, pagination, range) must not jump the page. */
    const didInitialProfileHeaderScrollRef = useRef(false);

    useEffect(() => {
        if (loading || !overviewPayload) return;
        const u = identityUser ?? pickUserAndPerformance(overviewPayload).user;
        if (!u) return;
        if (didInitialProfileHeaderScrollRef.current) return;
        const el = profileHeaderRef.current;
        if (!el) return;
        didInitialProfileHeaderScrollRef.current = true;
        requestAnimationFrame(() => {
            el.focus({ preventScroll: true });
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [loading, overviewPayload, identityUser]);

    useEffect(() => {
        hasLoadedOverviewRef.current = false;
        didInitialProfileHeaderScrollRef.current = false;
        setCurrentAssignedLeadsPage(1);
        setAssignedLeadStatusFilter(null);
        setAssignedLeadDataBatchId('');
        setProfileSelectionTargetCount('');
        setSelectedLeadIds([]);
        setMeetingsPage(1);
        setMeetingsData(null);
        setOverviewPayload(null);
        setAssignedLeadsListPayload(null);
    }, [numericId]);

    useEffect(() => {
        if (!numericId) {
            navigate('/brokerage/agents', { replace: true });
            return;
        }
        if (roleName === 'sales' && String(currentUser?.id) !== String(numericId)) {
            navigate('/dashboard', { replace: true });
            return;
        }
        if (!canViewOthers && roleName !== 'sales') {
            navigate('/dashboard', { replace: true });
            return;
        }
        loadOverview();
    }, [numericId, loadOverview, canViewOthers, roleName, currentUser?.id, navigate]);

    useEffect(() => {
        if (!numericId) return;
        loadMeetings(meetingsPage);
    }, [numericId, meetingsPage, loadMeetings]);

    useEffect(() => {
        if (!numericId) return;
        let cancelled = false;
        (async () => {
            try {
                const raw = await getAllDataBatches();
                const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
                if (!cancelled) setProfileDataBatches(Array.isArray(list) ? list : []);
            } catch {
                if (!cancelled) setProfileDataBatches([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [numericId]);

    useEffect(() => {
        if (!numericId || currentTab === 'sales') return;
        if (!hrData) loadHrProfile();
    }, [numericId, currentTab, hrData, loadHrProfile]);

    if (!numericId) return null;

    if (loading || !overviewPayload) {
        return <div className="p-12 text-center text-foreground/50">{t('salesProfile.loadingProfile')}</div>;
    }

    const { performance } = pickUserAndPerformance(overviewPayload);
    const user = identityUser ?? pickUserAndPerformance(overviewPayload).user;
    const meetingsList = meetingsData?.data ?? [];
    const filteredMeetingsList = (() => {
        const fromMs = meetingsFrom ? new Date(meetingsFrom).getTime() : null;
        const toMs = meetingsTo ? new Date(meetingsTo).getTime() : null;
        return meetingsList.filter((m: any) => {
            const at = m?.meetingDate ? new Date(m.meetingDate).getTime() : NaN;
            if (!Number.isFinite(at)) return true;
            if (fromMs != null && Number.isFinite(fromMs) && at < fromMs) return false;
            if (toMs != null && Number.isFinite(toMs) && at > toMs) return false;
            return true;
        });
    })();
    const meetingsMeta = meetingsData?.meta;
    const assignedTotalFromPerf = performance?.assignedLeadsTotal ?? 0;

    const mergedAssignedList = assignedLeadsListPayload?.data ?? [];
    const mergedAssignedMeta = {
        page: assignedLeadsListPayload?.meta?.page ?? 1,
        total: assignedLeadsListPayload?.meta?.total ?? 0,
        totalPages: assignedLeadsListPayload?.meta?.totalPages ?? 1,
        limit: assignedLeadsListPayload?.meta?.limit ?? PROFILE_ASSIGNED_LEADS_LIMIT,
    };
    const assignedTotalFromLeadsApi = assignedLeadsListPayload?.meta?.total ?? 0;

    const converted =
        performance?.leadsByStatus?.purchased ?? performance?.leadsByStatus?.converted ?? 0;
    const perf = performance;

    if (!user) {
        return (
            <div className="p-12 text-center space-y-4 max-w-lg mx-auto">
                <p className="text-foreground/70 text-sm">{t('salesProfile.profileDataMissing')}</p>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="text-sira-gold text-xs font-bold uppercase tracking-wider hover:underline"
                >
                    ← {t('salesProfile.back')}
                </button>
            </div>
        );
    }

    const profileDisplayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || t('salesProfile.thisUser');

    const canAccessHr = ['super_admin', 'hr', 'operation_manager', 'tech_lead'].includes(roleName) || String(currentUser?.id) === String(numericId);
    const canAccessFinance = ['super_admin', 'hr', 'finance', 'operation_manager', 'tech_lead'].includes(roleName) || String(currentUser?.id) === String(numericId);
    const lang = i18n.language;

    return (
        <div className="space-y-12 pb-20 animate-in fade-in duration-500 pt-4 max-w-7xl mx-auto px-4">
            {/* Header & Level 1 Navigation */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 lg:gap-8">
                <div className="space-y-1.5 min-w-0">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-sira-text-muted hover:text-sira-gold text-[10px] font-black uppercase tracking-[0.2em] transition-all mb-4 group"
                    >
                        <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
                        {t('salesProfile.back')}
                    </button>
                    <h1 className="text-[32px] font-black text-sira-text-primary tracking-tighter uppercase truncate">
                        {t('salesProfile.personnelDossier') || 'Personnel Dossier'}
                    </h1>
                    <div className="flex items-center gap-3">
                        <div className="h-0.5 w-12 bg-sira-gold/40" />
                        <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em] ">
                            {t('salesProfile.profileOverview') || 'Biometric Data & Professional Efficacy Statistics'}
                        </p>
                    </div>
                </div>

                <div className="no-scrollbar flex w-full items-center overflow-x-auto p-1.5 rounded-2xl bg-sira-bg-subtle border border-sira-border shadow-sm lg:w-auto">
                    {[
                        { id: 'sales', label: t('salesProfile.salesProfile') },
                        ...(canAccessHr ? [{ id: 'hr', label: t('hrModule.tabAttendance') }] : []),
                        ...(canAccessFinance ? [{ id: 'finance', label: t('hrModule.tabPayroll') }] : [])
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setCurrentTab(tab.id as any)}
                            className={`shrink-0 whitespace-nowrap px-4 py-2.5 sm:px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${currentTab === tab.id
                                    ? 'bg-sira-brown text-white shadow-premium'
                                    : 'text-sira-text-muted hover:text-sira-brown hover:bg-white/50'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div
                ref={profileHeaderRef}
                tabIndex={-1}
                className="overflow-hidden rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium p-8 md:p-10 outline-none focus-visible:ring-4 focus-visible:ring-sira-gold/20"
            >
                <div className="flex flex-col md:flex-row items-center gap-10">
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-[40px] bg-sira-brown flex items-center justify-center text-4xl font-black text-sira-gold border-4 border-sira-gold/10 shadow-premium group-hover:scale-105 transition-transform">
                            <UserCircle className="w-16 h-16" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-sira-gold flex items-center justify-center text-white border-4 border-white shadow-premium">
                            <Briefcase className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="flex-1 text-center md:text-start min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-sira-gold mb-2 block">{t('salesProfile.salesProfile')}</p>
                        <h2 className="text-3xl lg:text-4xl font-black text-sira-text-primary uppercase tracking-tight mb-6">
                            {[user.firstName, user.lastName].filter(Boolean).join(' ') || '—'}
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="flex items-center justify-center md:justify-start gap-3">
                                <div className="p-2 rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <span className="text-[12px] font-bold text-sira-text-secondary truncate">{user.email ?? '—'}</span>
                            </div>
                            {user.phone && (
                                <div className="flex items-center justify-center md:justify-start gap-3">
                                    <div className="p-2 rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border">
                                        <Phone className="w-4 h-4" />
                                    </div>
                                    <span className="text-[12px] font-bold text-sira-text-secondary tabular-nums">{user.phone}</span>
                                </div>
                            )}
                            <div className="flex items-center justify-center md:justify-start gap-3">
                                <div className="p-2 rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border">
                                    <Shield className="w-4 h-4" />
                                </div>
                                <span className="text-[12px] font-bold text-sira-text-secondary uppercase tracking-tight">
                                    {getRoleDisplayName(user.role, t) || '—'}
                                </span>
                            </div>
                            {user.team?.name && (
                                <div className="flex items-center justify-center md:justify-start gap-3">
                                    <div className="p-2 rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border">
                                        <Users className="w-4 h-4" />
                                    </div>
                                    <Link to={`/teams/${user.team.id}`} className="text-[12px] font-black text-sira-gold hover:text-sira-brown underline underline-offset-4 decoration-2 truncate">
                                        {user.team.name}
                                    </Link>
                                </div>
                            )}
                            {user.title && (
                                <div className="flex items-center justify-center md:justify-start gap-3">
                                    <div className="p-2 rounded-xl bg-sira-bg-subtle text-sira-gold border border-sira-border">
                                        <Briefcase className="w-4 h-4" />
                                    </div>
                                    <span className="text-[12px] font-bold text-sira-text-secondary capitalize">{user.title}</span>
                                </div>
                            )}
                            <div className="flex items-center justify-center md:justify-start gap-3">
                                <div className={`w-2 h-2 rounded-full ${user.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
                                <span className="text-[12px] font-bold text-sira-text-secondary capitalize">{user.status ? t(`common.${user.status}`, { defaultValue: user.status }) : '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {currentTab === 'sales' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Performance Filter & Top Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-1 rounded-[32px] border border-sira-border bg-sira-bg-card p-6 flex flex-col justify-center gap-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted">{t('salesProfile.performanceRange')}</p>
                            <Select value={performanceRange} onValueChange={(v: any) => setPerformanceRange(v)}>
                                <SelectTrigger className="h-11 w-full rounded-xl bg-sira-bg-subtle border-sira-border text-[10px] font-black uppercase tracking-widest text-sira-text-primary shadow-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-sira-border shadow-xl">
                                    <SelectItem value="all">{t('salesProfile.rangeAll')}</SelectItem>
                                    <SelectItem value="week">{t('salesProfile.rangeWeek')}</SelectItem>
                                    <SelectItem value="month">{t('salesProfile.rangeMonth')}</SelectItem>
                                    <SelectItem value="year">{t('salesProfile.rangeYear')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-6 group hover:-translate-y-1 transition-all shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-sira-bg-subtle flex items-center justify-center text-sira-gold mb-3 border border-sira-border group-hover:bg-sira-gold/10">
                                <Users className="w-5 h-5" />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-1">{t('salesProfile.leadsAssignedToProfile')}</p>
                            <p className="text-3xl font-black text-sira-text-primary tracking-tighter">{assignedTotalFromPerf}</p>
                        </div>

                        <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-6 group hover:-translate-y-1 transition-all shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-3 border border-emerald-500/20 group-hover:bg-emerald-500/20">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-1">{t('salesProfile.converted')}</p>
                            <p className="text-3xl font-black text-emerald-500 tracking-tighter">{converted}</p>
                        </div>

                        <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-6 group hover:-translate-y-1 transition-all shadow-sm">
                            <div className="w-10 h-10 rounded-xl bg-sira-bg-subtle flex items-center justify-center text-sira-gold mb-3 border border-sira-border group-hover:bg-sira-gold/10">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-1">{t('salesProfile.meetings')}</p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-3xl font-black text-sira-text-primary tracking-tighter">{perf.meetingsTotal ?? 0}</p>
                                <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-tight">/ {perf.meetingsCompleted ?? 0} {t('salesProfile.checkedOut')}</p>
                            </div>
                        </div>
                    </div>

                    {assignedTotalFromPerf > 0 &&
                        assignedTotalFromLeadsApi === 0 &&
                        mergedAssignedList.length === 0 &&
                        !profileLeadsLoading && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100/90 text-xs">
                                KPI shows <strong className="text-foreground">{assignedTotalFromPerf}</strong> assigned leads, but
                                the list below is empty. Try refreshing the page, or open{' '}
                                <strong className="text-foreground">Leads</strong> and filter by this assignee to confirm.
                            </div>
                        )}

                    <ProfileAssignedLeadsCard
                        profileDisplayName={profileDisplayName}
                        rows={mergedAssignedList}
                        meta={mergedAssignedMeta}
                        page={currentAssignedLeadsPage}
                        setPage={setCurrentAssignedLeadsPage}
                        tableLoading={profileLeadsLoading && mergedAssignedList.length === 0}
                        listLoading={profileLeadsLoading}
                        canViewLeadDetails={canViewLeadDetails}
                        onManageView={(l) => navigate(`/leads/${l.id}`)}
                        leadsByStatus={perf?.leadsByStatus ?? {}}
                        kpiAssignedTotal={assignedTotalFromPerf}
                        statusFilter={assignedLeadStatusFilter}
                        onStatusFilterChange={handleAssignedLeadStatusFilterChange}
                        canManageAsAdminOrOM={canManageAsAdminOrOM}
                        selectedLeadIds={selectedLeadIds}
                        toggleLeadSelection={toggleLeadSelection}
                        toggleAllLeads={toggleAllLeads}
                        onBulkRotation={handleBulkRotation}
                        onIndividualRotation={handleIndividualRotation}
                        rotatingLeadId={rotatingLeadId}
                        assignedLeadDataBatchId={assignedLeadDataBatchId}
                        onAssignedLeadDataBatchIdChange={handleAssignedLeadDataBatchChange}
                        profileDataBatches={profileDataBatches}
                        showLeadToolbar={canManageAsAdminOrOM}
                        profileSelectionTargetCount={profileSelectionTargetCount}
                        onProfileSelectionTargetCountChange={setProfileSelectionTargetCount}
                        onProfileApplySelectionCount={() => void applyProfileSelectionByCount()}
                        profileSelectionByCountLoading={profileSelectionByCountLoading}
                        onOpenReassignModal={() => setReassignModalOpen(true)}
                        reassignModalOpen={reassignModalOpen}
                        blurAssignedLeadPhones={
                            roleName === 'sales' && String(currentUser?.id) === String(numericId)
                        }
                    />

                    {meetingsList.length > 0 &&
                        mergedAssignedList.length === 0 &&
                        assignedTotalFromPerf === 0 &&
                        !profileLeadsLoading && (
                            <div
                                role="note"
                                className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] p-5 text-sm space-y-2"
                            >
                                <p className="font-black text-amber-200/95 text-[11px] uppercase tracking-wider">
                                    Meetings without current assigned leads?
                                </p>
                                <p className="text-foreground/80 text-xs leading-relaxed">
                                    A meeting is always linked to a lead. At the time it was booked, that lead was assigned to
                                    this user (or chosen in &quot;Schedule for&quot;). The{' '}
                                    <a href="#profile-all-leads" className="text-sira-gold font-bold underline">
                                        Leads assigned to this profile
                                    </a>{' '}
                                    only shows who owns the lead <em>now</em>. If those leads were{' '}
                                    <strong className="text-foreground">reassigned</strong> or cleared afterward, you will still see
                                    meetings here while that list looks empty — that is expected, not a bug.
                                </p>
                                <p className="text-foreground/80 text-xs leading-relaxed">
                                    To inspect leads that moved to someone else, use the main{' '}
                                    <Link to="/leads" className="text-sira-gold font-bold underline underline-offset-2">
                                        Leads
                                    </Link>{' '}
                                    page and filters there.
                                </p>
                                <p className="text-foreground/50 text-[11px] leading-relaxed pt-1 border-t border-amber-500/20">
                                    New meetings require an assigned lead, and the meeting is stored under the assignee&apos;s
                                    name so this line stays consistent going forward.
                                </p>
                            </div>
                        )}

                    <div
                        id="profile-meetings"
                        className="rounded-[32px] border border-sira-border bg-sira-bg-card p-8 md:p-10 shadow-premium scroll-mt-32 space-y-8"
                    >
                        <div className="flex items-center justify-between gap-6 pb-6 border-b border-sira-border/50">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.3)]" />
                                <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted ">{t('salesProfile.meetingsScheduledByUser')}</h2>
                            </div>
                            {meetingsMeta && (
                                <div className="px-3 py-1.5 rounded-xl bg-sira-bg-subtle border border-sira-border text-sira-text-muted text-[10px] font-black uppercase tracking-widest tabular-nums ">
                                    {t('salesProfile.pageOf', { page: meetingsMeta.page, totalPages: meetingsMeta.totalPages || 1, total: meetingsMeta.total })}
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <input
                                type="datetime-local"
                                value={meetingsFrom}
                                onChange={(e) => setMeetingsFrom(e.target.value)}
                                className="h-11 rounded-xl border border-sira-border bg-sira-bg-subtle px-3 text-[11px] font-bold text-sira-text-primary outline-none focus:border-sira-gold"
                                aria-label={t('leads.from')}
                            />
                            <input
                                type="datetime-local"
                                value={meetingsTo}
                                onChange={(e) => setMeetingsTo(e.target.value)}
                                className="h-11 rounded-xl border border-sira-border bg-sira-bg-subtle px-3 text-[11px] font-bold text-sira-text-primary outline-none focus:border-sira-gold"
                                aria-label={t('leads.to')}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setMeetingsFrom('');
                                    setMeetingsTo('');
                                }}
                                className="h-11 rounded-xl border border-sira-border bg-white px-4 text-[10px] font-black uppercase tracking-widest text-sira-text-muted transition hover:text-sira-gold"
                            >
                                {t('leads.clear')}
                            </button>
                        </div>

                        {filteredMeetingsList.length === 0 ? (
                            <div className="p-12 text-center text-sira-text-muted text-xs rounded-[32px] border border-dashed border-sira-border">
                                {t('salesProfile.noMeetingsFound')}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6">
                                {filteredMeetingsList.map((m: any) => {
                                    const leadLabel = m.lead
                                        ? `${m.lead.firstName ?? ''} ${m.lead.lastName ?? ''}`.trim() || m.lead.phone || '—'
                                        : '—';
                                    return (
                                        <div
                                            key={String(m.id)}
                                            className="rounded-[28px] border border-sira-border bg-sira-bg-subtle p-6 space-y-6 hover:bg-white transition-all hover:shadow-premium group"
                                        >
                                            <div className="flex flex-wrap gap-6 items-start justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-sira-gold border border-sira-border shadow-sm group-hover:bg-sira-bg-subtle transition-colors">
                                                        <Calendar className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mb-0.5">{t('salesProfile.scheduled')}</p>
                                                        <p className="text-[13px] font-black text-sira-text-primary uppercase tracking-tight">
                                                            {formatMeetingDateTime(m.meetingDate, i18n.language)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            setDetailMeeting(m);
                                                            setDetailLoading(true);
                                                            try {
                                                                const full = await getMeeting(m.id);
                                                                setDetailMeeting(full);
                                                            } catch {
                                                                toast.error(t('meetings.failedDetails'));
                                                                setDetailMeeting(null);
                                                            } finally {
                                                                setDetailLoading(false);
                                                            }
                                                        }}
                                                        className="px-4 py-2 rounded-xl bg-white text-sira-gold text-[10px] font-black uppercase border border-sira-border hover:bg-sira-gold hover:text-white transition-all shadow-sm tracking-widest "
                                                    >
                                                        {t('meetings.details')}
                                                    </button>
                                                    <span className="px-4 py-2 rounded-xl bg-sira-brown text-white text-[9px] font-black uppercase tracking-widest ">
                                                        {meetingStatusLabel(m.status)}
                                                    </span>
                                                    {m.isPrivate && (
                                                        <span className="px-4 py-2 rounded-xl bg-amber-500 text-white text-[9px] font-black uppercase tracking-widest ">
                                                            {t('salesProfile.private')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="grid md:grid-cols-2 gap-8 pt-6 border-t border-sira-border/50">
                                                <div className="space-y-4">
                                                    <div className="flex items-start gap-3">
                                                        <Users className="w-4 h-4 text-sira-gold mt-0.5" />
                                                        <div className="min-w-0">
                                                            <span className="text-[9px] font-black uppercase text-sira-text-muted block tracking-widest mb-1">{t('salesProfile.lead')}</span>
                                                            <p className="text-[12px] font-black text-sira-text-primary uppercase truncate">
                                                                {leadLabel}
                                                            </p>
                                                            {m.lead?.phone && (
                                                                <p className="text-[10px] font-bold text-sira-text-muted tabular-nums mt-0.5">{m.lead.phone}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {m.location && (
                                                        <div className="flex items-start gap-3">
                                                            <MapPin className="w-4 h-4 text-sira-gold mt-0.5" />
                                                            <div className="min-w-0">
                                                                <span className="text-[9px] font-black uppercase text-sira-text-muted block tracking-widest mb-1">{t('salesProfile.location')}</span>
                                                                <p className="text-[12px] font-bold text-sira-text-secondary">{m.location}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-4">
                                                    {(m.startedAt || m.endedAt) && (
                                                        <div className="flex items-start gap-3">
                                                            <Clock3 className="w-4 h-4 text-sira-gold mt-0.5" />
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase text-sira-text-muted block tracking-widest mb-1">{t('salesProfile.timeline')}</span>
                                                                <div className="space-y-1">
                                                                    {m.startedAt && (
                                                                        <p className="text-[10px] font-bold text-sira-text-secondary ">
                                                                            <span className="text-emerald-600 uppercase font-black mr-2">START:</span>
                                                                            {formatMeetingDateTime(m.startedAt, i18n.language)}
                                                                        </p>
                                                                    )}
                                                                    {m.endedAt && (
                                                                        <p className="text-[10px] font-bold text-sira-text-secondary ">
                                                                            <span className="text-red-600 uppercase font-black mr-2">END:</span>
                                                                            {formatMeetingDateTime(m.endedAt, i18n.language)}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {m.notes && (
                                                <div className="rounded-2xl bg-white border border-sira-border p-5 shadow-sm">
                                                    <p className="text-[9px] font-black uppercase text-sira-gold flex items-center gap-2 mb-3 tracking-widest ">
                                                        <FileText className="w-3.5 h-3.5" /> {t('salesProfile.notes')}
                                                    </p>
                                                    <p className="text-[12px] font-bold text-sira-text-primary leading-relaxed">{m.notes}</p>
                                                </div>
                                            )}

                                            {canManageAsAdminOrOM && (m.status === 'scheduled' || m.status === 'in_progress') && (
                                                <div className="flex flex-wrap gap-4 pt-6 border-t border-sira-border/50">
                                                    {m.status === 'scheduled' && (
                                                        <button
                                                            type="button"
                                                            disabled={startingMeetingId === Number(m.id)}
                                                            onClick={() => handleStartMeeting(m)}
                                                            className="inline-flex items-center gap-3 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-premium disabled:opacity-50"
                                                        >
                                                            {startingMeetingId === Number(m.id) ? (
                                                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                                                            ) : (
                                                                <Play className="w-4 h-4 fill-current" />
                                                            )}
                                                            {t('salesProfile.beginMeeting')}
                                                        </button>
                                                    )}
                                                    {m.status === 'in_progress' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setMeetingToEnd(m)}
                                                            className="inline-flex items-center gap-3 px-6 py-2.5 rounded-xl bg-sira-brown text-white text-[10px] font-black uppercase tracking-widest hover:bg-sira-brown-dark transition-all shadow-premium"
                                                        >
                                                            <MessageSquare className="w-4 h-4" />
                                                            {t('salesProfile.endMeetingFeedback')}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {meetingsMeta && meetingsMeta.totalPages > 1 && (
                            <div className="flex items-center justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    disabled={meetingsPage <= 1}
                                    onClick={() => setMeetingsPage((p) => Math.max(1, p - 1))}
                                    className="h-10 px-6 rounded-xl border border-sira-border bg-white text-[10px] font-black uppercase tracking-widest text-sira-text-muted hover:text-sira-gold transition-all shadow-sm disabled:opacity-40"
                                >
                                    {t('salesProfile.previous')}
                                </button>
                                <button
                                    type="button"
                                    disabled={meetingsPage >= (meetingsMeta.totalPages || 1)}
                                    onClick={() => setMeetingsPage((p) => p + 1)}
                                    className="h-10 px-6 rounded-xl border border-sira-border bg-white text-[10px] font-black uppercase tracking-widest text-sira-text-muted hover:text-sira-gold transition-all shadow-sm disabled:opacity-40"
                                >
                                    {t('salesProfile.next')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {currentTab === 'hr' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                    {hrLoading ? (
                        <div className="py-20 text-center text-sira-text-muted text-xs animate-pulse">
                            {t('hrModule.loading')}
                        </div>
                    ) : hrData ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-8 group hover:-translate-y-1 transition-all shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-2">{t('hrModule.colLate')}</p>
                                    <p className="text-3xl font-black text-amber-600 tracking-tighter tabular-nums">{hrData.stats.lateCount}</p>
                                </div>
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-8 group hover:-translate-y-1 transition-all shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-2">{t('hrModule.colAttendance')}</p>
                                    <p className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums">{hrData.attendance.length}</p>
                                </div>
                            </div>

                            <div className="rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium overflow-hidden">
                                <div className="p-8 border-b border-sira-border/50 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.3)]" />
                                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted ">
                                            {t('hrModule.tabAttendance')} History
                                        </h2>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-sira-bg-subtle text-sira-text-muted uppercase text-[9px] font-black tracking-[0.25em] ">
                                                <th className="px-8 py-5">Date</th>
                                                <th className="px-8 py-5">{t('hrModule.colCheckIn')}</th>
                                                <th className="px-8 py-5">{t('hrModule.colCheckOut')}</th>
                                                <th className="px-8 py-5">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-sira-border/30">
                                            {hrData.attendance.length === 0 ? (
                                                <tr><td colSpan={4} className="p-12 text-center text-sira-text-muted text-xs">No records found</td></tr>
                                            ) : (
                                                hrData.attendance.map((a: any) => (
                                                    <tr key={a.id} className="group hover:bg-sira-bg-hover transition-colors">
                                                        <td className="px-8 py-5 text-[11px] font-black text-sira-text-primary uppercase tracking-tight">{new Date(a.checkInTime).toLocaleDateString()}</td>
                                                        <td className="px-8 py-5 text-[11px] font-black text-emerald-600 tabular-nums">{new Date(a.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td className="px-8 py-5 text-[11px] font-black text-red-600/70 tabular-nums">
                                                            {a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            {a.isLate ? (
                                                                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 text-[9px] font-black uppercase border border-amber-500/20 tracking-widest ">LATE ({a.lateMinutes}m)</span>
                                                            ) : (
                                                                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase border border-emerald-500/20 tracking-widest ">ON TIME</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {currentTab === 'finance' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">
                    {hrLoading ? (
                        <div className="py-20 text-center text-sira-text-muted text-xs animate-pulse">
                            {t('hrModule.loading')}
                        </div>
                    ) : hrData ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-10 group hover:-translate-y-1 transition-all shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-2">Base Salary</p>
                                    <p className="text-3xl font-black text-sira-text-primary tracking-tighter tabular-nums">{formatMoney(hrData.user.salary, lang)}</p>
                                </div>
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-10 group hover:-translate-y-1 transition-all shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-2">Total Deductions</p>
                                    <p className="text-3xl font-black text-red-600 tracking-tighter tabular-nums">{formatMoney(hrData.stats.deductionsTotal, lang)}</p>
                                </div>
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card p-10 group hover:-translate-y-1 transition-all shadow-sm border-emerald-500/30">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted mb-2">Net Salary</p>
                                    <p className="text-3xl font-black text-emerald-600 tracking-tighter tabular-nums">{formatMoney(hrData.stats.netAfterDeductions, lang)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium overflow-hidden">
                                    <div className="p-8 border-b border-sira-border/50 flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.3)]" />
                                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted ">
                                            Deductions History
                                        </h2>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-sira-bg-subtle text-sira-text-muted uppercase text-[9px] font-black tracking-[0.25em] ">
                                                    <th className="px-8 py-5">Date</th>
                                                    <th className="px-8 py-5">Amount</th>
                                                    <th className="px-8 py-5">Reason</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-sira-border/30">
                                                {hrData.deductions.length === 0 ? (
                                                    <tr><td colSpan={3} className="p-12 text-center text-sira-text-muted text-xs">No records found</td></tr>
                                                ) : (
                                                    hrData.deductions.map((d: any) => (
                                                        <tr key={d.id} className="group hover:bg-sira-bg-hover transition-colors">
                                                            <td className="px-8 py-5 text-[11px] font-black text-sira-text-primary uppercase tracking-tight">{new Date(d.createdAt).toLocaleDateString()}</td>
                                                            <td className="px-8 py-5 text-[11px] font-black text-red-600 tabular-nums font-black">{formatMoney(d.amount, lang)}</td>
                                                            <td className="px-8 py-5 text-[11px] font-bold text-sira-text-muted ">{d.reason}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium overflow-hidden">
                                    <div className="p-8 border-b border-sira-border/50 flex items-center gap-3">
                                        <div className="h-2 w-2 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.3)]" />
                                        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted ">
                                            Commissions
                                        </h2>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-sira-bg-subtle text-sira-text-muted uppercase text-[9px] font-black tracking-[0.25em] ">
                                                    <th className="px-8 py-5">Sale</th>
                                                    <th className="px-8 py-5">Amount</th>
                                                    <th className="px-8 py-5">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-sira-border/30">
                                                {hrData.commissions.length === 0 ? (
                                                    <tr><td colSpan={3} className="p-12 text-center text-sira-text-muted text-xs">No records found</td></tr>
                                                ) : (
                                                    hrData.commissions.map((c: any) => (
                                                        <tr key={c.id} className="group hover:bg-sira-bg-hover transition-colors">
                                                            <td className="px-8 py-5">
                                                                <p className="text-[11px] font-black text-sira-text-primary uppercase tracking-tight mb-1">{c.title}</p>
                                                                <p className="text-[9px] font-black text-sira-text-muted uppercase tracking-widest">{new Date(c.saleDate).toLocaleDateString()}</p>
                                                            </td>
                                                            <td className="px-8 py-5 text-[11px] font-black text-emerald-600 tabular-nums">{formatMoney(c.amount, lang)}</td>
                                                            <td className="px-8 py-5">
                                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border tracking-widest ${c.status === 'collected' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                                    }`}>
                                                                    {c.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            {canManageAsAdminOrOM && (
                <>
                    <BulkAssignModal
                        isOpen={reassignModalOpen}
                        onClose={() => {
                            setReassignModalOpen(false);
                            setSelectedLeadIds([]);
                            loadOverview();
                        }}
                        leadIds={selectedLeadIds}
                        excludeUserIds={numericId ? [Number(numericId)] : []}
                    />
                    {meetingToEnd && (
                        <EndMeetingFeedbackModal
                            meeting={meetingToEnd}
                            currentUser={currentUser}
                            onClose={() => setMeetingToEnd(null)}
                            onSuccess={() => {
                                setMeetingToEnd(null);
                                refreshLists();
                                toast.success(t('salesProfile.meetingEndedSaved'));
                            }}
                        />
                    )}
                </>
            )}

            <Modal
                isOpen={Boolean(detailMeeting)}
                onClose={() => {
                    setDetailMeeting(null);
                    setDetailLoading(false);
                }}
                title={t('meetings.meetingDetails')}
            >
                {detailLoading && (
                    <div className="flex flex-col items-center justify-center py-20 text-sira-text-muted gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-sira-gold" />
                        <span className="text-[10px] font-black uppercase tracking-widest ">{t('meetings.loadingCheckInOut')}</span>
                    </div>
                )}
                {detailMeeting && !detailLoading && (
                    <div className="space-y-8 animate-in fade-in duration-500">
                        {/* Summary Header */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-3xl border border-sira-border bg-sira-bg-subtle p-6 hover:bg-white transition-all">
                                <p className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mb-2 ">{t('meetings.lead')}</p>
                                <p className="text-xl font-black text-sira-text-primary uppercase tracking-tight">
                                    {[detailMeeting.lead?.firstName, detailMeeting.lead?.lastName].filter(Boolean).join(' ') || '—'}
                                </p>
                                {detailMeeting.lead?.phone && <p className="text-[11px] font-bold text-sira-text-secondary mt-1 tabular-nums">{detailMeeting.lead.phone}</p>}
                            </div>
                            <div className="rounded-3xl border border-sira-border bg-sira-bg-subtle p-6 hover:bg-white transition-all">
                                <p className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mb-2 ">{t('meetings.statusLabel')}</p>
                                <div className="flex items-center gap-3">
                                    <span className="px-4 py-2 rounded-xl bg-sira-brown text-white text-[10px] font-black uppercase tracking-widest shadow-sm">
                                        {meetingStatusLabel(detailMeeting.status)}
                                    </span>
                                    {detailMeeting.meetingType && (
                                        <span className="px-4 py-2 rounded-xl bg-white border border-sira-border text-sira-gold text-[10px] font-black uppercase tracking-widest shadow-sm">
                                            {String(detailMeeting.meetingType).replace(/_/g, ' ')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Detailed Panels */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-sira-border/50">
                            <div className="space-y-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-sira-bg-subtle border border-sira-border flex items-center justify-center text-sira-gold">
                                        <Clock3 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mb-1 ">{t('meetings.scheduledTime')}</p>
                                        <p className="text-[13px] font-black text-sira-text-primary uppercase">{formatMeetingDateTime(detailMeeting.meetingDate, i18n.language)}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-sira-bg-subtle border border-sira-border flex items-center justify-center text-sira-gold">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mb-1 ">{t('meetings.plannedLocation')}</p>
                                        <p className="text-[13px] font-bold text-sira-text-secondary leading-snug">{detailMeeting.location || '—'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4 rounded-[24px] bg-sira-bg-subtle border border-sira-border p-6 shadow-inner">
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1 ">Check-in Sequence</p>
                                    <p className="text-[11px] font-bold text-sira-text-primary">
                                        {detailMeeting.startedAt
                                            ? formatMeetingDateTime(detailMeeting.startedAt, i18n.language)
                                            : 'Not started'}
                                    </p>
                                    {detailMeeting.currentLocation && (() => {
                                        const c = parseLatLng(detailMeeting.currentLocation);
                                        return c && (
                                            <a href={mapsQueryUrl(c.lat, c.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-black text-sira-gold hover:underline mt-1 uppercase tracking-widest ">
                                                <MapPin className="w-3 h-3" /> {t('previewDetail.mapsLink')}
                                            </a>
                                        );
                                    })()}
                                </div>
                                <div className="pt-4 border-t border-sira-border/50">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-red-600 mb-1 ">Check-out Sequence</p>
                                    <p className="text-[11px] font-bold text-sira-text-primary">
                                        {detailMeeting.endedAt
                                            ? formatMeetingDateTime(detailMeeting.endedAt, i18n.language)
                                            : 'Still in progress / No record'}
                                    </p>
                                    {detailMeeting.checkoutLocation && (() => {
                                        const c = parseLatLng(detailMeeting.checkoutLocation);
                                        return c && (
                                            <a href={mapsQueryUrl(c.lat, c.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-black text-sira-gold hover:underline mt-1 uppercase tracking-widest ">
                                                <MapPin className="w-3 h-3" /> {t('previewDetail.mapsLink')}
                                            </a>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {detailMeeting.notes && (
                            <div className="rounded-3xl border border-sira-border bg-white p-8 shadow-sm">
                                <p className="text-[9px] font-black uppercase text-sira-gold flex items-center gap-2 mb-4 tracking-widest ">
                                    <FileText className="w-4 h-4" /> {t('salesProfile.notes')}
                                </p>
                                <p className="text-[13px] font-bold text-sira-text-secondary leading-relaxed whitespace-pre-wrap">{detailMeeting.notes}</p>
                            </div>
                        )}

                        <div className="rounded-[32px] overflow-hidden border border-sira-border bg-white shadow-premium">
                            <div className="bg-sira-bg-subtle px-6 py-4 border-b border-sira-border flex items-center gap-3">
                                <MapPin className="w-4 h-4 text-sira-gold" />
                                <h3 className="text-[10px] font-black uppercase text-sira-text-muted tracking-widest ">Presence Mapping</h3>
                            </div>
                            <div className="p-4">
                                <MeetingLocationsMap
                                    meeting={detailMeeting}
                                    planned={detailMeeting.location}
                                    checkIn={detailMeeting.currentLocation}
                                    checkOut={detailMeeting.checkoutLocation}
                                    heightClass="h-[400px]"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

