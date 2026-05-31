import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    MapPin,
    Bed,
    Bath,
    Maximize,
    Layers,
    Building2,
    CheckCircle2,
    ExternalLink,
    Globe,
    Info,
    Phone,
    MessageSquare,
    Pencil,
    Share2,
    Check,
    X,
    XCircle,
    Loader2,
    Megaphone,
    Bookmark,
} from 'lucide-react';
import Modal from '../components/ui/Modal';
import {
    getUnit,
    reviewUnitApproval,
    updateUnit,
    publishUnit,
    createUnitPreview,
    checkUnitPreviewAvailability,
    getAllLeads,
    type UnitPayload,
    type PreviewAvailability,
} from '../services/api';
import { toast } from '../lib/toast';
import {
    stringArrayFromJson,
    getUnitTypeLabel,
    formatDate,
    parsePublishedLinks,
    formatPublishName,
} from '../lib/unitDisplayHelpers';
import { useTranslation } from 'react-i18next';
import { UNIT_STATUS_BADGE, unitStatusBadgeClass } from '../lib/siraStyles';
import { isAppRtl } from '../lib/i18nDirection';
import { formatMoney as formatMoneyLocale } from '../lib/currency';
import { useSelector } from 'react-redux';
import { getCanonicalRoleName, getUserRoleName } from '../lib/userRole';
import { isUnitSaved, toggleSavedUnit } from '../lib/savedItems';

type UnitDetail = {
    id: string | number;
    code: string;
    description: string;
    ownerName?: string | null;
    ownerPhone?: string | null;
    address?: string | null;
    projectName?: string | null;
    location?: string | null;
    floor?: number | string | null;
    price?: string | number | null;
    monthlyInstallment?: string | number | null;
    deliveryDate?: string | null;
    driveMediaLink?: string | null;
    isPublished?: boolean;
    publishedLink?: string | null;
    publishedAt?: string | null;
    bedrooms?: number | string | null;
    bathrooms?: number | string | null;
    area?: string | number | null;
    unitType?: string | null;
    amenities?: unknown;
    externalLinks?: unknown;
    status?: string;
    createdBy?: string | number | null;
    creator?: {
        firstName?: string;
        lastName?: string;
        phone?: string | null;
        role?: { name?: string | null; displayName?: string | null } | null;
    };
    publishedBy?: { firstName?: string; lastName?: string } | null;
    approvalStatus?: 'pending_operation' | 'approved_for_marketing' | 'rejected_by_operation' | string;
};

function parseFiniteNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(n) ? n : null;
}

function normalizePhoneForTel(value: string | null | undefined): string {
    if (!value) return '';
    const arabicIndicMap: Record<string, string> = {
        '٠': '0',
        '١': '1',
        '٢': '2',
        '٣': '3',
        '٤': '4',
        '٥': '5',
        '٦': '6',
        '٧': '7',
        '٨': '8',
        '٩': '9',
    };
    const normalizedDigits = value.replace(/[٠-٩]/g, (ch) => arabicIndicMap[ch] ?? ch);
    const cleaned = normalizedDigits.replace(/[^0-9+]/g, '');
    return cleaned.startsWith('+') ? `+${cleaned.slice(1).replace(/[^0-9]/g, '')}` : cleaned.replace(/[^0-9]/g, '');
}

export default function UnitDetailPage() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const { unitId } = useParams<{ unitId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const fromTab = (location.state as { unitsTab?: string } | null)?.unitsTab;
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const isSuperAdmin =
        roleName === 'super_admin' || roleName === 'super admin' || roleName === 'superadmin';
    const isOperationApprover = roleName === 'operation_manager' || roleName === 'operation manager' || isSuperAdmin;
    const canPublishFromDetails =
        roleName === 'marketing' ||
        roleName === 'operation_manager' ||
        roleName === 'operation manager' ||
        isSuperAdmin;

    const [unit, setUnit] = useState<UnitDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [approvalBusy, setApprovalBusy] = useState<'approve' | 'reject' | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [publishSaving, setPublishSaving] = useState(false);
    const [publishPlaces, setPublishPlaces] = useState<Array<{ name: string; link: string }>>([{ name: '', link: '' }]);
    const [unitSaved, setUnitSaved] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewSaving, setPreviewSaving] = useState(false);
    const [previewLeadSearch, setPreviewLeadSearch] = useState('');
    const [previewLeadOptions, setPreviewLeadOptions] = useState<any[]>([]);
    const [previewLeadSearchLoading, setPreviewLeadSearchLoading] = useState(false);
    const [selectedPreviewLead, setSelectedPreviewLead] = useState<any | null>(null);
    const [previewForm, setPreviewForm] = useState({
        clientName: '',
        clientPhone: '',
        scheduledAt: '',
        durationMin: 60,
        notes: '',
    });
    const [previewSlotCheck, setPreviewSlotCheck] = useState<{
        loading: boolean;
        result: PreviewAvailability | null;
        error: string | null;
    }>({ loading: false, result: null, error: null });
    const [editForm, setEditForm] = useState({
        description: '',
        location: '',
        projectName: '',
        address: '',
        unitType: '',
        status: 'available' as UnitPayload['status'],
        price: '',
        monthlyInstallment: '',
        area: '',
        bedrooms: '',
        bathrooms: '',
        floor: '',
        deliveryDate: '',
        driveMediaLink: '',
        ownerName: '',
        ownerPhone: '',
        publishedLinksPreview: '',
    });

    const backHref =
        fromTab && typeof fromTab === 'string'
            ? `/units?tab=${encodeURIComponent(fromTab)}`
            : '/units?tab=inventory';

    const fmtDateTime = useCallback((value: string | Date) => {
        const d = typeof value === 'string' ? new Date(value) : value;
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString(i18n.language || undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    }, [i18n.language]);
    const leadLabel = useCallback((l: any) => `${l?.firstName ?? ''} ${l?.lastName ?? ''}`.trim(), []);

    const load = useCallback(async () => {
        if (!unitId) return;
        setLoading(true);
        try {
            const data = await getUnit(unitId);
            setUnit(data as UnitDetail);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || t('unitDetail.couldNotLoad'));
            setUnit(null);
        } finally {
            setLoading(false);
        }
    }, [unitId, t]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!unit?.id) {
            setUnitSaved(false);
            return;
        }
        setUnitSaved(isUnitSaved(Number(unit.id)));
    }, [unit?.id]);

    const sharePage = useCallback(async () => {
        const url = typeof window !== 'undefined' ? window.location.href : '';
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('unitDetail.shareCopied'));
        } catch {
            toast.error(t('unitDetail.share'));
        }
    }, [t]);

    const handleToggleSaveUnit = useCallback(() => {
        if (roleName !== 'sales') {
            toast.error(t('saved.salesOnlyHint', { defaultValue: 'Saved items are available for sales only' }));
            return;
        }
        if (!unit) return;
        const next = toggleSavedUnit({
            id: Number(unit.id),
            code: String(unit.code || ''),
            projectName: unit.projectName || undefined,
        });
        setUnitSaved(next);
        toast.success(
            next
                ? t('saved.savedUnitSuccess', { defaultValue: 'Unit saved' })
                : t('saved.unsavedUnitSuccess', { defaultValue: 'Unit removed from saved' }),
        );
    }, [roleName, unit, t]);

    const approvalOf = useCallback((u: UnitDetail | null) => {
        if (!u) return '';
        if (u.isPublished) return 'approved_for_marketing';
        const direct = String(u.approvalStatus || '').trim();
        if (direct) return direct;
        if (!u.publishedLink) return 'pending_operation';
        try {
            const parsed = JSON.parse(u.publishedLink);
            const wf = String((parsed as any)?.workflow || '').trim();
            if (wf) return wf;
        } catch {
            // ignore
        }
        return 'pending_operation';
    }, []);

    const handleApprove = useCallback(async () => {
        if (!unit) return;
        if (approvalBusy) return;
        setApprovalBusy('approve');
        try {
            await reviewUnitApproval(unit.id, { decision: 'approve' });
            toast.success(t('units.approvalApproved'));
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || t('units.approvalFailed'));
        } finally {
            setApprovalBusy(null);
        }
    }, [unit, load, t, approvalBusy]);

    const handleReject = useCallback(async () => {
        if (!unit) return;
        if (approvalBusy) return;
        setRejectReason('');
        setRejectModalOpen(true);
    }, [unit, approvalBusy]);

    const handleConfirmReject = useCallback(async () => {
        if (!unit) return;
        if (approvalBusy) return;
        const reason = rejectReason.trim();
        if (!reason) {
            toast.error(t('units.rejectReasonRequired'));
            return;
        }
        setApprovalBusy('reject');
        try {
            await reviewUnitApproval(unit.id, {
                decision: 'reject',
                note: reason,
            });
            toast.success(t('units.approvalRejected'));
            setRejectModalOpen(false);
            setRejectReason('');
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || t('units.approvalFailed'));
        } finally {
            setApprovalBusy(null);
        }
    }, [unit, load, t, approvalBusy, rejectReason]);

    const openEditModal = useCallback(() => {
        if (!unit) return;
        const slug = getCanonicalRoleName(user);
        const uid = user?.id != null ? Number(user.id) : null;
        const creatorId = unit.createdBy != null ? Number(unit.createdBy) : null;
        const canEdit =
            ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(slug) ||
            (slug === 'sales' && uid != null && creatorId != null && uid === creatorId);
        if (!canEdit) {
            toast.error(t('unitDetail.editNotAllowed'));
            return;
        }
        setEditForm({
            description: unit.description || '',
            location: unit.location || '',
            projectName: unit.projectName || '',
            address: unit.address || '',
            unitType: unit.unitType || '',
            status: ((unit.status || 'available') as UnitPayload['status']) || 'available',
            price: unit.price != null ? String(unit.price) : '',
            monthlyInstallment: unit.monthlyInstallment != null ? String(unit.monthlyInstallment) : '',
            area: unit.area != null ? String(unit.area) : '',
            bedrooms: unit.bedrooms != null ? String(unit.bedrooms) : '',
            bathrooms: unit.bathrooms != null ? String(unit.bathrooms) : '',
            floor: unit.floor != null ? String(unit.floor) : '',
            deliveryDate: unit.deliveryDate ? String(unit.deliveryDate).slice(0, 10) : '',
            driveMediaLink: unit.driveMediaLink || '',
            ownerName: unit.ownerName || '',
            ownerPhone: unit.ownerPhone || '',
            publishedLinksPreview: (() => {
                const links = parsePublishedLinks(unit.publishedLink || '');
                if (links.places.length > 0) {
                    return links.places
                        .map((p) => `${formatPublishName(p.name)} | ${p.link}`)
                        .join('\n');
                }
                return unit.publishedLink || '';
            })(),
        });
        setEditOpen(true);
    }, [unit, user, t]);

    const submitEdit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unit) return;
        if (!editForm.description.trim()) {
            toast.error(t('units.unitModal.toastDescriptionRequired'));
            return;
        }
        setEditSaving(true);
        try {
            const body: Partial<UnitPayload> = {
                description: editForm.description.trim(),
                location: editForm.location.trim() || undefined,
                projectName: editForm.projectName.trim() || undefined,
                address: editForm.address.trim() || undefined,
                unitType: editForm.unitType.trim() || undefined,
                status: editForm.status,
                price: editForm.price.trim() === '' ? undefined : Number(editForm.price),
                monthlyInstallment: editForm.monthlyInstallment.trim() === '' ? undefined : Number(editForm.monthlyInstallment),
                area: editForm.area.trim() === '' ? undefined : Number(editForm.area),
                bedrooms: editForm.bedrooms.trim() === '' ? undefined : Number(editForm.bedrooms),
                bathrooms: editForm.bathrooms.trim() === '' ? undefined : Number(editForm.bathrooms),
                floor: editForm.floor.trim() === '' ? null : Number(editForm.floor),
                deliveryDate: editForm.deliveryDate.trim() || null,
                driveMediaLink: editForm.driveMediaLink.trim() || undefined,
                ownerName: editForm.ownerName.trim() || null,
                ownerPhone: editForm.ownerPhone.trim() || null,
            };
            await updateUnit(unit.id, body);
            toast.success(t('units.unitModal.toastUnitUpdated'));
            setEditOpen(false);
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || t('units.unitModal.toastSaveFailed'));
        } finally {
            setEditSaving(false);
        }
    }, [unit, editForm, t, load]);

    const submitPublish = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unit) return;
        setPublishSaving(true);
        try {
            const places = publishPlaces
                .map((p) => ({ name: p.name.trim(), link: p.link.trim() }))
                .filter((p) => p.name && p.link);
            const nextIsPublished = places.length > 0;
            const publishedLink = nextIsPublished ? JSON.stringify({ places }) : undefined;
            await publishUnit(unit.id, {
                isPublished: nextIsPublished,
                publishedLink,
            });
            toast.success(
                nextIsPublished ? t('units.publishModal.successPublished') : t('units.publishModal.successCleared'),
            );
            setPublishOpen(false);
            setPublishPlaces([{ name: '', link: '' }]);
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || t('units.publishModal.errorUpdate'));
        } finally {
            setPublishSaving(false);
        }
    }, [unit, publishPlaces, load, t]);

    const openPreviewModal = useCallback(() => {
        setPreviewForm({
            clientName: '',
            clientPhone: '',
            scheduledAt: '',
            durationMin: 60,
            notes: '',
        });
        setSelectedPreviewLead(null);
        setPreviewLeadSearch('');
        setPreviewLeadOptions([]);
        setPreviewSlotCheck({ loading: false, result: null, error: null });
        setPreviewOpen(true);
    }, []);

    const closePreviewModal = useCallback(() => {
        setPreviewOpen(false);
        setPreviewSaving(false);
        setPreviewSlotCheck({ loading: false, result: null, error: null });
    }, []);

    const runPreviewLeadSearch = useCallback(async (rawQuery: string) => {
        const q = rawQuery.trim();
        setPreviewLeadSearchLoading(true);
        try {
            const res = await getAllLeads(1, 20, {
                search: q || undefined,
                q: q || undefined,
                excludeRotation: true,
            });
            const rows = Array.isArray(res?.data) ? res.data : [];
            setPreviewLeadOptions(rows);
        } catch {
            setPreviewLeadOptions([]);
        } finally {
            setPreviewLeadSearchLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!previewOpen) return;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (cancelled) return;
            await runPreviewLeadSearch(previewLeadSearch);
        }, 300);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [previewOpen, previewLeadSearch, runPreviewLeadSearch]);

    useEffect(() => {
        if (!previewOpen || !unit?.id || !previewForm.scheduledAt?.trim()) {
            setPreviewSlotCheck({ loading: false, result: null, error: null });
            return;
        }
        let cancelled = false;
        setPreviewSlotCheck({ loading: true, result: null, error: null });
        const timer = window.setTimeout(async () => {
            try {
                const res = await checkUnitPreviewAvailability({
                    unitId: Number(unit.id),
                    scheduledAt: previewForm.scheduledAt,
                    durationMin: Number(previewForm.durationMin) || 60,
                });
                if (!cancelled) {
                    setPreviewSlotCheck({ loading: false, result: res, error: null });
                }
            } catch (err: any) {
                if (!cancelled) {
                    const msg = err?.response?.data?.message;
                    setPreviewSlotCheck({
                        loading: false,
                        result: null,
                        error: Array.isArray(msg) ? msg[0] : msg || t('units.previewRequest.availabilityFailed'),
                    });
                }
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [previewOpen, unit?.id, previewForm.scheduledAt, previewForm.durationMin, t]);

    const submitPreviewRequest = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!unit?.id) return;
        if (!selectedPreviewLead?.id) {
            toast.error(t('meetings.searchLeadPlaceholder', { defaultValue: 'Search lead by name, phone, or email' }));
            return;
        }
        if (!previewForm.scheduledAt) {
            toast.error(t('units.previewRequest.dateTimeRequired'));
            return;
        }
        if (previewSlotCheck.loading || (previewForm.scheduledAt?.trim() && !previewSlotCheck.result)) {
            toast.info(t('units.previewRequest.checkingAvailability'));
            return;
        }
        if (previewSlotCheck.result && previewSlotCheck.result.available === false) {
            const c = previewSlotCheck.result.conflict;
            toast.error(`${t('units.previewRequest.slotUnavailablePrefix')} ${c.assignedToName}`);
            return;
        }
        setPreviewSaving(true);
        try {
            const selectedLeadName = leadLabel(selectedPreviewLead).trim();
            const selectedLeadPhone = String(selectedPreviewLead?.phone ?? '').trim();
            const created = await createUnitPreview({
                unitId: Number(unit.id),
                clientName: selectedLeadName || previewForm.clientName.trim(),
                clientPhone: selectedLeadPhone || previewForm.clientPhone.trim() || undefined,
                scheduledAt: previewForm.scheduledAt,
                durationMin: Number(previewForm.durationMin) || 60,
                notes: previewForm.notes.trim() || undefined,
            });
            const status = String(created?.status || '').toLowerCase();
            if (status === 'scheduled') {
                toast.success(t('units.previewRequest.toastScheduledDirect'));
            } else if (status === 'pending') {
                toast.success(t('units.previewRequest.toastRequested'));
            } else {
                toast.success(t('units.previewRequest.toastSuccess'));
            }
            closePreviewModal();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || t('units.previewRequest.toastFail'));
        } finally {
            setPreviewSaving(false);
        }
    }, [unit?.id, previewForm, previewSlotCheck, closePreviewModal, t, selectedPreviewLead, leadLabel]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-100 border-t-[#0B1828] dark:border-sira-border" />
                <p className="text-sm font-bold text-slate-500">{t('unitDetail.loading')}</p>
            </div>
        );
    }

    if (!unit) {
        return (
            <div
                className="mx-auto mt-12 max-w-lg rounded-[2.5rem] border border-slate-50 bg-white p-8 text-center dark:border-sira-border dark:bg-sira-bg-card"
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <p className="mb-4 font-bold text-slate-400">{t('unitDetail.notFound')}</p>
                <Link
                    to={backHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0B1828] px-6 py-3 text-sm font-black text-white"
                >
                    <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                    {t('unitDetail.backToUnits')}
                </Link>
            </div>
        );
    }

    const creatorName = unit.creator
        ? `${unit.creator.firstName ?? ''} ${unit.creator.lastName ?? ''}`.trim()
        : '';
    const creatorInitials = creatorName
        ? creatorName
              .split(' ')
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)
        : 'SI';
    const creatorPhoneDisplay = String(unit.creator?.phone || '').trim();
    const creatorPhoneForTel = normalizePhoneForTel(creatorPhoneDisplay);
    const canCallCreator = creatorPhoneForTel.length > 0;
    const creatorPhoneForWhatsapp = creatorPhoneForTel.replace(/^\+/, '');

    const ownerNameDisplay = String(unit.ownerName || '').trim();
    const ownerPhoneDisplay = String(unit.ownerPhone || '').trim();
    const ownerPhoneForTel = normalizePhoneForTel(ownerPhoneDisplay);
    const canCallOwner = ownerPhoneForTel.length > 0;
    const ownerPhoneForWhatsapp = ownerPhoneForTel.replace(/^\+/, '');
    const hasOwnerInfo = Boolean(ownerNameDisplay || ownerPhoneDisplay);

    const areaN = parseFiniteNumber(unit.area);
    const bedsN = parseFiniteNumber(unit.bedrooms);
    const bathsN = parseFiniteNumber(unit.bathrooms);
    const floorN = parseFiniteNumber(unit.floor);

    const areaDisplay = areaN != null ? `${areaN} m²` : t('unitDetail.na');
    const bedsDisplay = bedsN != null ? t('unitDetail.roomsShort', { count: bedsN }) : t('unitDetail.na');
    const bathsDisplay = bathsN != null ? t('unitDetail.bathsShort', { count: bathsN }) : t('unitDetail.na');
    const floorDisplay = floorN != null ? t('unitDetail.floorLabel', { n: floorN }) : t('unitDetail.na');

    const priceStr = formatMoneyLocale(unit.price, i18n.language);
    const monthlyStr = formatMoneyLocale(unit.monthlyInstallment, i18n.language);
    const hasPrice = priceStr !== '\u2014' && priceStr !== '—';
    const hasMonthly = monthlyStr !== '\u2014' && monthlyStr !== '—';

    const titleLine =
        [unit.projectName?.trim(), unit.unitType ? getUnitTypeLabel(unit.unitType) : ''].filter(Boolean).join(' · ') ||
        unit.code;

    const currentUserId = user?.id != null ? Number(user.id) : null;
    const unitCreatorId = unit.createdBy != null ? Number(unit.createdBy) : null;
    const previewIsOwnUnit = currentUserId != null && unitCreatorId != null && currentUserId === unitCreatorId;
    const canonicalRole = getCanonicalRoleName(user);
    const canEditThisUnit =
        ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(canonicalRole) ||
        (canonicalRole === 'sales' && previewIsOwnUnit);
    const approvalStatus = approvalOf(unit);
    const creatorRoleName = String(unit?.creator?.role?.name || '').toLowerCase();
    const canShowApprovalActions =
        isOperationApprover &&
        creatorRoleName === 'sales' &&
        !unit.isPublished &&
        approvalStatus === 'pending_operation';
    const canShowPublishAction = canPublishFromDetails && !unit.isPublished && approvalStatus === 'approved_for_marketing';

    return (
        <div className="space-y-6 p-4 font-sans md:p-8" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Top header */}
            <div className="relative flex flex-col items-stretch justify-between gap-6 overflow-hidden rounded-[2.5rem] border border-slate-50 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card md:flex-row md:items-center md:p-8">
                <div className="pointer-events-none absolute end-0 top-0 -mt-16 -me-16 h-32 w-32 rounded-full bg-blue-500/5" />
                <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#0B1828] text-white shadow-xl shadow-blue-900/20">
                        <Building2 size={28} />
                    </div>
                    <div className="min-w-0 text-start">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-blue-600 dark:bg-blue-500/10">
                                {t('unitDetail.badgeLabel')}
                            </span>
                            <span className="text-[10px] font-black uppercase text-slate-400">#{unit.code}</span>
                            <span
                                className={`rounded-lg px-3 py-1 text-[9px] font-black ${unitStatusBadgeClass(unit.status)}`}
                            >
                                {UNIT_STATUS_BADGE[(unit.status || 'available').toLowerCase()]?.label || 'AVAILABLE'}
                            </span>
                            {unit.isPublished ? (
                                <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                                    {t('unitDetail.published')}
                                </span>
                            ) : null}
                        </div>
                        <h1 className="text-2xl font-black tracking-tight text-[#0B1828] dark:text-foreground">{titleLine}</h1>
                        {unit.location ? (
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                <MapPin size={14} className="shrink-0 text-blue-500" aria-hidden />
                                <span>{unit.location}</span>
                            </p>
                        ) : null}
                    </div>
                </div>
                <div className="relative z-10 flex flex-wrap items-center gap-2 md:justify-end">
                    {canEditThisUnit ? (
                    <button
                        type="button"
                        onClick={() => openEditModal()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#0B1828] transition-all hover:bg-slate-100 dark:border-sira-border dark:bg-foreground/5 dark:text-foreground dark:hover:bg-foreground/10"
                    >
                        <Pencil size={16} aria-hidden />
                        {t('unitDetail.editUnit')}
                    </button>
                    ) : null}
                    {canShowApprovalActions ? (
                        <>
                            <button
                                type="button"
                                onClick={() => void handleApprove()}
                                disabled={approvalBusy != null}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-all hover:bg-emerald-600 hover:text-white dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                            >
                                {approvalBusy === 'approve' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
                                {t('units.approve')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleReject()}
                                disabled={approvalBusy != null}
                                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-rose-700 transition-all hover:bg-rose-600 hover:text-white dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                            >
                                {approvalBusy === 'reject' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <XCircle size={16} aria-hidden />}
                                {t('units.reject')}
                            </button>
                        </>
                    ) : null}
                    {canShowPublishAction ? (
                        <button
                            type="button"
                            onClick={() => {
                                const links = parsePublishedLinks(unit.publishedLink || '');
                                setPublishPlaces(links.places.length > 0 ? links.places : [{ name: '', link: '' }]);
                                setPublishOpen(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-[#0B1828] bg-[#0B1828] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800"
                        >
                            <Megaphone size={16} aria-hidden />
                            {t('units.publish')}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => void handleToggleSaveUnit()}
                        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all ${unitSaved
                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                            : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-slate-300 dark:hover:bg-foreground/5'
                            }`}
                    >
                        <Bookmark size={16} aria-hidden />
                        {t('sidebar.saved', { defaultValue: 'Saved' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => void sharePage()}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-slate-300 dark:hover:bg-foreground/5"
                    >
                        <Share2 size={16} aria-hidden />
                        {t('unitDetail.share')}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(backHref)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50 dark:border-sira-border dark:bg-transparent dark:text-slate-400 dark:hover:bg-foreground/5"
                    >
                        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
                        {t('unitDetail.backToList')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
                {/* Main column */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Quick specs */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        {(
                            [
                                {
                                    label: t('unitDetail.area'),
                                    val: areaDisplay,
                                    icon: <Maximize size={18} aria-hidden />,
                                },
                                {
                                    label: t('unitDetail.beds'),
                                    val: bedsDisplay,
                                    icon: <Bed size={18} aria-hidden />,
                                },
                                {
                                    label: t('unitDetail.baths'),
                                    val: bathsDisplay,
                                    icon: <Bath size={18} aria-hidden />,
                                },
                                {
                                    label: t('unitDetail.floor'),
                                    val: floorDisplay,
                                    icon: <Layers size={18} aria-hidden />,
                                },
                            ] as const
                        ).map((s, i) => (
                            <div
                                key={i}
                                className="group rounded-2xl border border-slate-50 bg-white p-5 text-center shadow-sm transition-all hover:border-blue-600/40 dark:border-sira-border dark:bg-sira-bg-card"
                            >
                                <div className="mb-2 flex justify-center text-slate-300 transition-colors group-hover:text-blue-600 dark:text-foreground/25 dark:group-hover:text-sira-gold">
                                    {s.icon}
                                </div>
                                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{s.label}</p>
                                <p className="text-sm font-black text-[#0B1828] dark:text-foreground">{s.val}</p>
                            </div>
                        ))}
                    </div>

                    {/* Details + amenities + links */}
                    <div className="space-y-8 rounded-[2.5rem] border border-slate-50 bg-white p-8 shadow-sm dark:border-sira-border dark:bg-sira-bg-card md:p-10">
                        <div className="space-y-4">
                            <h2 className="flex items-center gap-3 text-lg font-black text-[#0B1828] dark:text-foreground">
                                <Info size={20} className="shrink-0 text-blue-600 dark:text-sira-gold" aria-hidden />
                                {t('unitDetail.detailsHeading')}
                            </h2>
                            <p className="text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                                {unit.description?.trim() ? unit.description : t('unitDetail.notSpecified')}
                            </p>
                        </div>

                        {unit.address ? (
                            <p className="flex items-start gap-2 text-xs font-bold text-slate-500">
                                <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
                                <span>{unit.address}</span>
                            </p>
                        ) : null}

                        {hasOwnerInfo ? (
                            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                                <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900/80 dark:text-emerald-300">
                                    {t('unitDetail.ownerInfo')}
                                </h3>
                                {ownerNameDisplay ? (
                                    <p className="text-sm font-black text-[#0B1828] dark:text-foreground">{ownerNameDisplay}</p>
                                ) : null}
                                {ownerPhoneDisplay ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                        {canCallOwner ? (
                                            <>
                                                <a
                                                    href={`tel:${ownerPhoneForTel}`}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-sira-bg-card dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                                                    dir="ltr"
                                                >
                                                    <Phone size={14} className="shrink-0" aria-hidden />
                                                    {ownerPhoneDisplay}
                                                </a>
                                                <a
                                                    href={`https://wa.me/${ownerPhoneForWhatsapp}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-sira-bg-card dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                                                >
                                                    <MessageSquare size={14} className="shrink-0" aria-hidden />
                                                    WhatsApp
                                                </a>
                                            </>
                                        ) : (
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200" dir="ltr">
                                                {ownerPhoneDisplay}
                                            </span>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {stringArrayFromJson(unit.amenities).length > 0 ? (
                            <div className="space-y-4 border-t border-slate-50 pt-8 dark:border-sira-border">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                                    {t('unitDetail.amenities')}
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {stringArrayFromJson(unit.amenities).map((f) => (
                                        <div
                                            key={f}
                                            className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300"
                                        >
                                            <CheckCircle2 size={12} className="shrink-0 text-emerald-500" aria-hidden />
                                            {f}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {stringArrayFromJson(unit.externalLinks).length > 0 ? (
                            <div className="space-y-3 border-t border-slate-50 pt-8 dark:border-sira-border">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                                    {t('unitDetail.externalLinks')}
                                </h3>
                                {stringArrayFromJson(unit.externalLinks).map((href) => (
                                    <a
                                        key={href}
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block break-all text-xs font-semibold text-blue-600 hover:underline dark:text-sira-gold"
                                    >
                                        {href}
                                    </a>
                                ))}
                            </div>
                        ) : null}

                        {unit.driveMediaLink ? (
                            <div className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/80 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-blue-500/25 dark:bg-blue-500/10">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm dark:bg-foreground/10 dark:text-blue-300">
                                        <Globe size={22} aria-hidden />
                                    </div>
                                    <div className="min-w-0 text-start">
                                        <p className="text-xs font-black text-[#0B1828] dark:text-foreground">
                                            {t('unitDetail.driveMediaLink')}
                                        </p>
                                        <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            {t('unitDetail.driveSubtitle')}
                                        </p>
                                    </div>
                                </div>
                                <a
                                    href={unit.driveMediaLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0B1828] px-6 py-2.5 text-[10px] font-black text-white dark:bg-sira-gold dark:text-[#0B1828]"
                                >
                                    {t('unitDetail.openLink')}
                                    <ExternalLink size={14} aria-hidden />
                                </a>
                            </div>
                        ) : null}
                    </div>

                    {/* Published */}
                    {unit.publishedLink &&
                        (() => {
                            const links = parsePublishedLinks(unit.publishedLink);
                            if (links.places.length === 0) return null;
                            return (
                                <div className="space-y-4 rounded-[2.5rem] border border-slate-50 bg-white p-8 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                                        {t('unitDetail.publishedListing')}
                                    </h3>
                                    {links.places.map((place, idx) => (
                                        <a
                                            key={`${place.name}-${idx}`}
                                            href={place.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="group block rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5 text-sm transition-all hover:-translate-y-0.5 hover:border-[#0B1828] hover:shadow-md dark:border-sira-border dark:from-foreground/5 dark:to-foreground/[0.07]"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <span className="inline-flex items-center rounded-full bg-[#0B1828]/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#0B1828] dark:bg-slate-200/10 dark:text-slate-100">
                                                        {formatPublishName(place.name)}
                                                    </span>
                                                    <p className="mt-2 truncate text-[12px] font-bold text-slate-700 underline decoration-slate-300 underline-offset-2 transition-colors group-hover:text-[#0B1828] dark:text-slate-200 dark:decoration-slate-500">
                                                        {place.link}
                                                    </p>
                                                </div>
                                                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors group-hover:border-[#0B1828] group-hover:bg-[#0B1828] group-hover:text-white dark:border-sira-border dark:bg-foreground/10 dark:text-slate-300">
                                                    <ExternalLink size={14} aria-hidden />
                                                </span>
                                            </div>
                                        </a>
                                    ))}
                                    {unit.publishedAt ? (
                                        <p className="text-[10px] text-slate-400">
                                            {formatDate(unit.publishedAt)}
                                            {unit.publishedBy
                                                ? ` · ${unit.publishedBy.firstName} ${unit.publishedBy.lastName}`
                                                : ''}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })()}
                </div>

                {/* Sidebar: price + contact */}
                <div className="space-y-6 lg:col-span-1">
                    <div className="relative overflow-hidden rounded-[2.5rem] bg-[#0B1828] p-8 text-white shadow-2xl md:p-10">
                        <div className="pointer-events-none absolute end-0 top-0 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl" />
                        <div className="relative z-10">
                            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {t('unitDetail.totalPrice')}
                            </p>
                            <p className="mb-1 text-3xl font-black tracking-tighter text-[#BF9B30] md:text-4xl">
                                {hasPrice ? priceStr : t('unitDetail.na')}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400">{t('unitDetail.currencyEgpLong')}</p>

                            <div className="mt-8 space-y-4 border-t border-white/10 pt-8">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {t('unitDetail.monthlyInstallment')}
                                    </span>
                                    <span className="text-sm font-black text-emerald-400">
                                        {hasMonthly ? monthlyStr : t('unitDetail.na')}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {t('unitDetail.deliveryDate')}
                                    </span>
                                    <span className="text-xs font-black">{formatDate(unit.deliveryDate)}</span>
                                </div>
                            </div>

                            {unit.isPublished ? (
                                <button
                                    type="button"
                                    onClick={openPreviewModal}
                                    className="mt-8 w-full rounded-2xl bg-[#BF9B30] py-4 text-xs font-black text-[#0B1828] shadow-xl transition-all active:scale-[0.99]"
                                >
                                    {t('unitDetail.bookViewing')}
                                </button>
                            ) : (
                                <p className="mt-8 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-[10px] font-bold leading-relaxed text-slate-400">
                                    {t('unitDetail.bookViewingWhenPublished')}
                                </p>
                            )}
                        </div>
                    </div>

                    {creatorName ? (
                        <div className="rounded-[2.5rem] border border-slate-50 bg-white p-8 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                            <h3 className="mb-6 text-xs font-black uppercase tracking-widest text-slate-400">
                                {t('unitDetail.unitResponsible')}
                            </h3>
                            <div className="mb-6 flex items-center gap-4">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xs font-black text-[#0B1828] dark:bg-foreground/5 dark:text-foreground">
                                    {creatorInitials}
                                </div>
                                <div className="min-w-0 text-start">
                                    <p className="text-sm font-black text-[#0B1828] dark:text-foreground">{creatorName}</p>
                                    <p className="text-[9px] font-bold uppercase text-slate-400">{t('unitDetail.agentRole')}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {canCallCreator ? (
                                    <a
                                        href={`tel:${creatorPhoneForTel}`}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-50 py-3 text-blue-600 transition-all hover:bg-blue-600 hover:text-white dark:bg-blue-500/10"
                                        title={creatorPhoneDisplay}
                                    >
                                        <Phone size={16} aria-hidden />
                                        <span className="text-[11px] font-black" dir="ltr">
                                            {creatorPhoneDisplay}
                                        </span>
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        disabled
                                        title={t('unitDetail.na')}
                                        className="flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-emerald-50/50 py-3 text-emerald-600/40 opacity-60 dark:bg-emerald-500/5"
                                    >
                                        <Phone size={16} aria-hidden />
                                        <span className="text-[11px] font-black">{t('unitDetail.na')}</span>
                                    </button>
                                )}
                                {canCallCreator ? (
                                    <a
                                        href={`https://wa.me/${creatorPhoneForWhatsapp}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={creatorPhoneDisplay}
                                        className="flex flex-1 items-center justify-center rounded-xl bg-emerald-50 py-3 text-emerald-600 transition-all hover:bg-emerald-600 hover:text-white dark:bg-emerald-500/10"
                                    >
                                        <MessageSquare size={16} aria-hidden />
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        disabled
                                        title={t('unitDetail.na')}
                                        className="flex flex-1 cursor-not-allowed items-center justify-center rounded-xl bg-blue-50/50 py-3 text-blue-600/40 opacity-60 dark:bg-blue-500/5"
                                    >
                                        <MessageSquare size={16} aria-hidden />
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            {editOpen &&
                createPortal(
                <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-700/35 backdrop-blur-sm" onClick={() => setEditOpen(false)} aria-hidden />
                    <div className="relative z-10 flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-100 px-6 py-4 sm:px-8">
                            <h2 className="text-xl font-black text-[#0B1828]">{t('units.unitModal.titleEdit')}</h2>
                        </div>
                        <form onSubmit={submitEdit} className="custom-scrollbar overflow-y-auto p-6 sm:p-8 space-y-5">
                            <div className="space-y-2">
                                <label className="modal-label">{t('units.unitModal.description')}</label>
                                <textarea className="modal-textarea" value={editForm.description} onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <input className="modal-input" placeholder={t('units.unitModal.projectCompound')} value={editForm.projectName} onChange={(e) => setEditForm((s) => ({ ...s, projectName: e.target.value }))} />
                                <input className="modal-input" placeholder={t('units.unitModal.areaLocation')} value={editForm.location} onChange={(e) => setEditForm((s) => ({ ...s, location: e.target.value }))} />
                                <input className="modal-input" placeholder={t('units.unitModal.unitAddress')} value={editForm.address} onChange={(e) => setEditForm((s) => ({ ...s, address: e.target.value }))} />
                                <input className="modal-input" placeholder={t('units.unitModal.unitType')} value={editForm.unitType} onChange={(e) => setEditForm((s) => ({ ...s, unitType: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.priceEgp')} value={editForm.price} onChange={(e) => setEditForm((s) => ({ ...s, price: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.monthlyInstallmentEgp')} value={editForm.monthlyInstallment} onChange={(e) => setEditForm((s) => ({ ...s, monthlyInstallment: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.areaM2')} value={editForm.area} onChange={(e) => setEditForm((s) => ({ ...s, area: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.floor')} value={editForm.floor} onChange={(e) => setEditForm((s) => ({ ...s, floor: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.beds')} value={editForm.bedrooms} onChange={(e) => setEditForm((s) => ({ ...s, bedrooms: e.target.value }))} />
                                <input className="modal-input" type="number" placeholder={t('units.unitModal.baths')} value={editForm.bathrooms} onChange={(e) => setEditForm((s) => ({ ...s, bathrooms: e.target.value }))} />
                                <input className="modal-input" type="date" value={editForm.deliveryDate} onChange={(e) => setEditForm((s) => ({ ...s, deliveryDate: e.target.value }))} />
                                <select className="modal-field-select" value={editForm.status || 'available'} onChange={(e) => setEditForm((s) => ({ ...s, status: e.target.value as UnitPayload['status'] }))}>
                                    <option value="available">{t('units.unitModal.statusAvailable')}</option>
                                    <option value="reserved">{t('units.unitModal.statusReserved')}</option>
                                    <option value="sold">{t('units.unitModal.statusSold')}</option>
                                    <option value="unavailable">{t('units.unitModal.statusUnavailable')}</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="modal-label">{t('units.unitModal.driveMediaLink')}</label>
                                <input className="modal-input" type="url" value={editForm.driveMediaLink} onChange={(e) => setEditForm((s) => ({ ...s, driveMediaLink: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="modal-label">{t('units.unitModal.ownerName') || 'Owner Name'}</label>
                                    <input className="modal-input" value={editForm.ownerName} onChange={(e) => setEditForm((s) => ({ ...s, ownerName: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <label className="modal-label">{t('units.unitModal.ownerPhone') || 'Owner Phone'}</label>
                                    <input className="modal-input" value={editForm.ownerPhone} onChange={(e) => setEditForm((s) => ({ ...s, ownerPhone: e.target.value }))} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="modal-label">{t('unitDetail.publishedListing')}</label>
                                <textarea
                                    className="modal-textarea"
                                    value={editForm.publishedLinksPreview}
                                    readOnly
                                    placeholder={t('common.notExist') || 'not exist'}
                                />
                            </div>
                            <div className="flex gap-3 border-t border-slate-200 pt-5">
                                <button type="button" onClick={() => setEditOpen(false)} className="modal-btn-secondary flex-1">{t('units.unitModal.cancel')}</button>
                                <button type="submit" disabled={editSaving} className="modal-btn-primary flex-1">
                                    {editSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {t('units.unitModal.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body,
            )}
            {publishOpen &&
                createPortal(
                    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6">
                        <div className="absolute inset-0 bg-slate-700/35 backdrop-blur-sm" onClick={() => setPublishOpen(false)} aria-hidden />
                        <div className="relative z-10 w-full max-w-xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl sm:p-8">
                            <h3 className="text-lg font-black text-[#0B1828]">{t('units.publish')}</h3>
                            <p className="mt-2 text-xs text-slate-500">
                                {t('units.publishModal.intro')}
                            </p>
                            <form onSubmit={submitPublish} className="mt-5 space-y-4">
                                {publishPlaces.map((place, idx) => (
                                    <div
                                        key={idx}
                                        className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            {publishPlaces.length > 1 ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setPublishPlaces((prev) => prev.filter((_, i) => i !== idx))
                                                    }
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 shadow-sm transition-colors hover:bg-rose-100"
                                                    title={t('units.publishModal.removeRow')}
                                                    aria-label={t('units.publishModal.removeRow')}
                                                >
                                                    <X className="h-4 w-4 stroke-[2.5]" />
                                                </button>
                                            ) : (
                                                <span className="h-8 w-8 shrink-0" aria-hidden />
                                            )}
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B1828]">
                                                {t('units.publishModal.rowLabel', { n: idx + 1 })}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-700">
                                                    {t('units.publishModal.publishLink')}
                                                </label>
                                                <input
                                                    value={place.link}
                                                    onChange={(e) =>
                                                        setPublishPlaces((prev) =>
                                                            prev.map((p, i) =>
                                                                i === idx ? { ...p, link: e.target.value } : p,
                                                            ),
                                                        )
                                                    }
                                                    placeholder={t('units.publishModal.linkPlaceholder')}
                                                    dir="ltr"
                                                    className="modal-input"
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-700">
                                                    {t('units.publishModal.placeName')}
                                                </label>
                                                <input
                                                    value={place.name}
                                                    onChange={(e) =>
                                                        setPublishPlaces((prev) =>
                                                            prev.map((p, i) =>
                                                                i === idx ? { ...p, name: e.target.value } : p,
                                                            ),
                                                        )
                                                    }
                                                    placeholder={t('units.publishModal.placePlaceholder', {
                                                        n: idx + 1,
                                                    })}
                                                    className="modal-input"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setPublishPlaces((prev) => [...prev, { name: '', link: '' }])}
                                    className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-transparent py-2.5 text-xs font-bold text-[#0B1828] transition-colors hover:bg-slate-50"
                                >
                                    {t('units.publishModal.addAnother')}
                                </button>
                                <p className="mt-1 text-[10px] text-neutral-500">
                                    {t('units.publishModal.footerHint')}
                                </p>
                                <div className="flex gap-3 border-t border-slate-200 pt-4">
                                    <button type="button" onClick={() => setPublishOpen(false)} className="modal-btn-secondary flex-1">
                                        {t('units.unitModal.cancel')}
                                    </button>
                                    <button type="submit" disabled={publishSaving} className="modal-btn-primary flex-1">
                                        {publishSaving ? <Loader2 size={16} className="animate-spin" /> : null}
                                        {t('units.publish')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>,
                    document.body,
                )}
            <Modal
                isOpen={rejectModalOpen}
                onClose={() => {
                    if (approvalBusy === 'reject') return;
                    setRejectModalOpen(false);
                    setRejectReason('');
                }}
                title={t('units.reject')}
                subtitle={t('units.approvalRejectReasonOptional')}
                size="sm"
            >
                <div className="space-y-4">
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        {t('units.approvalRejectConfirm')}
                    </p>
                    {unit ? (
                        <p className="text-xs font-black text-slate-500 dark:text-slate-400">
                            {unit.code} {unit.projectName ? `· ${unit.projectName}` : ''}
                        </p>
                    ) : null}
                    <div>
                        <label className="modal-label">
                            {t('units.rejectReason')}
                        </label>
                        <textarea
                            rows={3}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            required
                            className="modal-textarea min-h-[88px]"
                            placeholder={t('units.rejectReasonPlaceholder')}
                        />
                    </div>
                    <div className="modal-actions-stack">
                        <button
                            type="button"
                            onClick={handleConfirmReject}
                            disabled={approvalBusy === 'reject' || !rejectReason.trim()}
                            className="modal-btn-danger flex items-center justify-center gap-2"
                        >
                            {approvalBusy === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t('common.yes', { defaultValue: 'Yes' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (approvalBusy === 'reject') return;
                                setRejectModalOpen(false);
                                setRejectReason('');
                            }}
                            disabled={approvalBusy === 'reject'}
                            className="modal-btn-secondary"
                        >
                            {t('common.no', { defaultValue: 'No' })}
                        </button>
                    </div>
                </div>
            </Modal>
            <Modal
                isOpen={previewOpen}
                onClose={closePreviewModal}
                title={t('units.previewRequest.title')}
                subtitle={t('units.previewRequest.subtitle')}
                size="lg"
            >
                <form onSubmit={submitPreviewRequest} className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold text-slate-700">
                        {previewIsOwnUnit
                            ? t('units.previewRequest.ownUnitDirectInfo')
                            : t('units.previewRequest.otherUnitNeedsApprovalInfo')}
                        <span className="mt-1 block text-[10px] font-bold text-slate-500">
                            {t('units.previewRequest.overlapBlockedInfo')}
                        </span>
                    </div>

                    <div>
                        <label className="modal-label">{t('meetings.selectClient', { defaultValue: 'Select Client' })}</label>
                        <input
                            value={previewLeadSearch}
                            onChange={(e) => {
                                setPreviewLeadSearch(e.target.value);
                                setSelectedPreviewLead(null);
                                setPreviewForm((s) => ({ ...s, clientName: '', clientPhone: '' }));
                            }}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const first = previewLeadOptions[0];
                                if (!first) return;
                                setSelectedPreviewLead(first);
                                setPreviewLeadSearch(
                                    `${leadLabel(first)}${first?.phone ? ` — ${first.phone}` : ''}`,
                                );
                                setPreviewForm((s) => ({
                                    ...s,
                                    clientName: leadLabel(first),
                                    clientPhone: String(first?.phone ?? ''),
                                }));
                            }}
                            placeholder={t('meetings.searchLeadPlaceholder', {
                                defaultValue: 'Search lead by name, phone, or email',
                            })}
                            className="modal-input mb-2"
                        />
                        {selectedPreviewLead ? (
                            <p className="mb-2 text-xs font-bold text-emerald-700">
                                {t('meetings.selectedLead', { defaultValue: 'Selected lead' })}: {previewLeadSearch}
                            </p>
                        ) : null}
                        <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                            {previewLeadSearchLoading ? (
                                <div className="px-3 py-2 text-xs font-bold text-slate-500">
                                    {t('meetings.loading', { defaultValue: 'Loading...' })}
                                </div>
                            ) : null}
                            {!previewLeadSearchLoading &&
                                previewLeadOptions.slice(0, 20).map((l) => (
                                    <button
                                        key={String(l.id)}
                                        type="button"
                                        onClick={() => {
                                            setSelectedPreviewLead(l);
                                            setPreviewLeadSearch(`${leadLabel(l)}${l?.phone ? ` — ${l.phone}` : ''}`);
                                            setPreviewForm((s) => ({
                                                ...s,
                                                clientName: leadLabel(l),
                                                clientPhone: String(l?.phone ?? ''),
                                            }));
                                        }}
                                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[#0B1828] transition hover:bg-[#0B1828] hover:text-white"
                                    >
                                        <span>{leadLabel(l)}</span>
                                        <span className="text-xs opacity-80" dir="ltr">
                                            {l?.phone || l?.email || ''}
                                        </span>
                                    </button>
                                ))}
                            {!previewLeadSearchLoading && previewLeadOptions.length === 0 ? (
                                <div className="px-2 py-2 text-xs font-bold text-slate-500">
                                    {t('meetings.noLeadsFound', { defaultValue: 'No matching leads found' })}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className="modal-label">{t('units.previewRequest.dateTimeRequired')}</label>
                            <input
                                required
                                type="datetime-local"
                                value={previewForm.scheduledAt}
                                onChange={(e) => setPreviewForm((s) => ({ ...s, scheduledAt: e.target.value }))}
                                className="modal-input"
                            />
                        </div>
                        <div>
                            <label className="modal-label">{t('units.previewRequest.durationMinutes')}</label>
                            <input
                                type="number"
                                min={5}
                                value={previewForm.durationMin}
                                onChange={(e) =>
                                    setPreviewForm((s) => ({
                                        ...s,
                                        durationMin: Number(e.target.value) || 60,
                                    }))
                                }
                                className="modal-input"
                            />
                        </div>
                    </div>

                    {previewForm.scheduledAt?.trim() && previewSlotCheck.loading ? (
                        <p className="flex items-center gap-2 text-xs text-slate-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t('units.previewRequest.checkingAvailability')}
                        </p>
                    ) : null}
                    {previewForm.scheduledAt?.trim() && previewSlotCheck.error ? (
                        <p className="text-xs text-rose-600">{previewSlotCheck.error}</p>
                    ) : null}
                    {previewSlotCheck.result?.available === true &&
                    previewForm.scheduledAt?.trim() &&
                    !previewSlotCheck.loading ? (
                        <p className="text-xs font-medium text-emerald-600">{t('units.previewRequest.slotAvailable')}</p>
                    ) : null}
                    {previewSlotCheck.result?.available === false && !previewSlotCheck.loading ? (
                        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs leading-snug text-amber-800">
                            {t('units.previewRequest.slotUnavailablePrefix')}{' '}
                            <span className="font-bold">{previewSlotCheck.result.conflict.assignedToName}</span>{' '}
                            {t('units.previewRequest.slotUnavailableMiddle')} (
                            {fmtDateTime(previewSlotCheck.result.conflict.scheduledAt)} -{' '}
                            {fmtDateTime(previewSlotCheck.result.conflict.endsAt)}).
                        </p>
                    ) : null}

                    <div>
                        <label className="modal-label">{t('units.previewRequest.notes')}</label>
                        <textarea
                            rows={2}
                            value={previewForm.notes}
                            onChange={(e) => setPreviewForm((s) => ({ ...s, notes: e.target.value }))}
                            className="modal-textarea min-h-[64px]"
                            placeholder={t('units.previewRequest.notesPlaceholder')}
                        />
                    </div>

                    <div className="modal-actions-stack">
                        <button
                            type="submit"
                            disabled={
                                previewSaving ||
                                previewSlotCheck.loading ||
                                (!!previewForm.scheduledAt?.trim() && !previewSlotCheck.result) ||
                                previewSlotCheck.result?.available === false
                            }
                            className="modal-btn-primary flex items-center justify-center gap-2"
                        >
                            {previewSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t('units.previewRequest.submitRequest')}
                        </button>
                        <button type="button" onClick={closePreviewModal} className="modal-btn-secondary">
                            {t('common.cancel')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
