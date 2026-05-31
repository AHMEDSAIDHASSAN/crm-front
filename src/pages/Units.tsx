import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Plus,
    X,
    Pencil,
    Trash2,
    Loader2,
    Megaphone,
    Clock,
    CheckCircle2,
    Eye,
    LogIn,
    LogOut,
    XCircle,
    Check,
    ExternalLink,
    Search,
    Building2,
    MessageSquare,
    Grid2X2,
    List,
    ChevronRight,
    Share2,
    Bookmark,
    RotateCcw,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import Modal from '../components/ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    getUnits,
    getNextUnitCode,
    getAllTeams,
    getUsersByRole,
    createUnit,
    updateUnit,
    deleteUnit,
    publishUnit,
    reviewUnitApproval,
    getUnitPreviews,
    getMyUnitsPreviewRequests,
    createUnitPreview,
    approveUnitPreview,
    rejectUnitPreview,
    checkInUnitPreview,
    checkOutUnitPreview,
    cancelUnitPreview,
    checkUnitPreviewAvailability,
    type UnitPayload,
    type PreviewRow,
    type PreviewPayload,
    type PreviewAvailability,
} from '../services/api';
import { toast } from '../lib/toast';
import {
    stringArrayFromJson,
    getUnitTypeLabel,
    normalizeUnitType,
    unitCodeAutoPatternPreview,
    formatMoney,
    formatDate,
    parsePublishedLinks,
} from '../lib/unitDisplayHelpers';
import { subscribeUnitPreviewActivity } from '../lib/unitPreviewRealtime';
import { getCurrentLocationForPreview } from '../lib/previewGeolocation';
import {
    PREVIEW_STATUS_STYLES,
    fmtDateTimePreview,
    previewRequesterName,
} from '../lib/unitPreviewHelpers';
import { useTranslation } from 'react-i18next';
import { isAppRtl } from '../lib/i18nDirection';
import { getUserRoleName } from '../lib/userRole';
import { UNIT_STATUS_BADGE, unitStatusBadgeClass, UNIT_TYPE_WIZARD } from '../lib/siraStyles';
import { getSavedUnits, toggleSavedUnit } from '../lib/savedItems';

type UnitRow = {
    id: string | number;
    code: string;
    description: string;
    ownerName?: string | null;
    ownerPhone?: string | null;
    address?: string | null;
    projectName?: string | null;
    location?: string | null;
    floor?: number | null;
    price?: string | number | null;
    monthlyInstallment?: string | number | null;
    deliveryDate?: string | null;
    driveMediaLink?: string | null;
    isPublished?: boolean;
    publishedLink?: string | null;
    publishedAt?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    area?: string | number | null;
    unitType?: string | null;
    amenities?: unknown;
    externalLinks?: unknown;
    status?: string;
    createdBy?: string | number | null;
    creator?: {
        id?: string | number;
        firstName?: string;
        lastName?: string;
        role?: { name?: string | null; displayName?: string | null } | null;
    };
    publishedBy?: { firstName?: string; lastName?: string } | null;
    approvalStatus?: 'pending_operation' | 'approved_for_marketing' | 'rejected_by_operation' | string;
};

/** API may return camelCase or snake_case; trim for display and forms. */
function resolveDriveMediaLink(u: UnitRow): string | null {
    const raw =
        u.driveMediaLink ??
        (u as UnitRow & { drive_media_link?: string | null }).drive_media_link;
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    return s.length ? s : null;
}

function normalizeSearchValue(v: unknown): string {
    return String(v ?? '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

type SalesOption = {
    id: string | number;
    firstName?: string;
    lastName?: string;
};

type TeamOption = {
    id: string | number;
    name?: string;
};

/** Stored values stay English for API/DB; labels use `units.unitModal.amenities.*`. */
const AMENITY_PRESETS: ReadonlyArray<{ value: string; i18nKey: string }> = [
    { value: 'Central AC', i18nKey: 'centralAc' },
    { value: 'Elevator', i18nKey: 'elevator' },
    { value: 'Garage', i18nKey: 'garage' },
    { value: 'Garden', i18nKey: 'garden' },
    { value: '24h Security', i18nKey: 'security24h' },
    { value: 'Swimming pool', i18nKey: 'swimmingPool' },
];

const emptyForm: UnitPayload = {
    description: '',
    ownerName: '',
    ownerPhone: '',
    address: '',
    projectName: '',
    location: '',
    floor: undefined,
    price: undefined,
    monthlyInstallment: undefined,
    deliveryDate: '',
    driveMediaLink: '',
    bedrooms: undefined,
    bathrooms: undefined,
    area: undefined,
    unitType: 'd',
    amenities: [],
    externalLinks: [],
    status: 'available',
};

function unitToForm(u: UnitRow): UnitPayload {
    return {
        code: u.code ?? '',
        description: u.description ?? '',
        ownerName: u.ownerName ?? '',
        ownerPhone: u.ownerPhone ?? '',
        address: u.address ?? '',
        projectName: u.projectName ?? '',
        location: u.location ?? '',
        floor: u.floor != null ? Number(u.floor) : undefined,
        price: u.price != null && u.price !== '' ? Number(u.price) : undefined,
        monthlyInstallment:
            u.monthlyInstallment != null && u.monthlyInstallment !== ''
                ? Number(u.monthlyInstallment)
                : undefined,
        deliveryDate: u.deliveryDate ? formatDate(u.deliveryDate) : '',
        driveMediaLink: resolveDriveMediaLink(u) ?? '',
        bedrooms: u.bedrooms ?? undefined,
        bathrooms: u.bathrooms ?? undefined,
        area: u.area != null && u.area !== '' ? Number(u.area) : undefined,
        unitType: normalizeUnitType(u.unitType ?? ''),
        amenities: stringArrayFromJson(u.amenities),
        externalLinks: stringArrayFromJson(u.externalLinks),
        status: (u.status as UnitPayload['status']) || 'available',
    };
}

function payloadForApi(form: UnitPayload, isEdit: boolean): UnitPayload | Partial<UnitPayload> {
    const trimmedCode = (form.code ?? '').trim();
    const base: Record<string, unknown> = {
        description: form.description.trim(),
        projectName: form.projectName?.trim() || undefined,
        location: form.location?.trim() || undefined,
        unitType: normalizeUnitType(form.unitType as string),
        status: form.status,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        area: form.area,
        price: form.price,
        monthlyInstallment: form.monthlyInstallment,
        ownerName: form.ownerName?.trim() || null,
        ownerPhone: form.ownerPhone?.trim() || null,
    };
    const addr = form.address?.trim();
    if (addr) base.address = addr;
    else if (isEdit) base.address = null;

    if (form.floor != null && !Number.isNaN(Number(form.floor))) {
        base.floor = Number(form.floor);
    } else if (isEdit) {
        base.floor = null;
    }

    const am = form.amenities ?? [];
    if (am.length > 0) base.amenities = [...am];
    else if (isEdit) base.amenities = null;

    const ext = form.externalLinks ?? [];
    if (ext.length > 0) base.externalLinks = [...ext];
    else if (isEdit) base.externalLinks = null;

    if (trimmedCode) base.code = trimmedCode;
    const drive = form.driveMediaLink?.trim();
    if (drive) base.driveMediaLink = drive;
    else if (isEdit) base.driveMediaLink = null;
    if (form.deliveryDate && String(form.deliveryDate).trim()) {
        base.deliveryDate = String(form.deliveryDate).slice(0, 10);
    } else if (isEdit) {
        base.deliveryDate = null;
    }
    return base as UnitPayload;
}

const INVENTORY_ROLES = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead', 'sales'];
const PUBLISH_ROLES = ['marketing', 'super_admin', 'operation_manager'];

type TabKey = 'my_units' | 'inventory' | 'requests' | 'awaiting_marketing' | 'published' | 'previews' | 'incoming_requests';

const emptyPreviewForm: PreviewPayload = {
    unitId: 0,
    clientName: '',
    clientPhone: '',
    scheduledAt: '',
    durationMin: 60,
    notes: '',
};

const PREVIEW_PHONE_DIAL_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: '+20', label: '🇪🇬 +20' },
    { value: '+966', label: '🇸🇦 +966' },
    { value: '+971', label: '🇦🇪 +971' },
    { value: '+965', label: '🇰🇼 +965' },
    { value: '+974', label: '🇶🇦 +974' },
    { value: '+973', label: '🇧🇭 +973' },
    { value: '+968', label: '🇴🇲 +968' },
    { value: '+962', label: '🇯🇴 +962' },
    { value: '+961', label: '🇱🇧 +961' },
];

function combinePreviewInternationalPhone(dial: string, national: string): string | undefined {
    const n = national.replace(/\D/g, '');
    if (!n) return undefined;
    return `${dial.replace(/\s/g, '')}${n}`;
}

function buildSmsHref(phone: string, body: string): string {
    const cleaned = phone.replace(/[^\d+]/g, '');
    return `sms:${cleaned}?body=${encodeURIComponent(body)}`;
}

export default function Units() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const fmtDateTime = (iso: string | null | undefined) => fmtDateTimePreview(iso, i18n.language);
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const isSuperAdminRole =
        roleName === 'super_admin' ||
        roleName === 'super admin' ||
        roleName === 'superadmin';
    const currentUserId = user?.id != null ? String(user.id) : '';
    const canInventory = INVENTORY_ROLES.includes(roleName);
    const canPublish = PUBLISH_ROLES.includes(roleName);
    const isMarketing = roleName === 'marketing';
    const isSales = roleName === 'sales';
    const isSuperAdmin = isSuperAdminRole;
    const isOperationApprover =
        roleName === 'operation_manager' ||
        roleName === 'operation manager' ||
        isSuperAdminRole;
    /** Marketing is publish-only portal; super_admin keeps full inventory management tabs. */
    const isPublisherPortal = isMarketing;
    const isAdmin = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(roleName);
    const canFilterByTeam = isAdmin;

    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const [units, setUnits] = useState<UnitRow[]>([]);
    const [savedUnitIds, setSavedUnitIds] = useState<Set<number>>(
        () => new Set(getSavedUnits().map((x) => Number(x.id))),
    );
    const [inventorySearch, setInventorySearch] = useState('');
    const [selectedSalesId, setSelectedSalesId] = useState('all');
    const [selectedTeamId, setSelectedTeamId] = useState('all');
    const [, setSalesOptions] = useState<SalesOption[]>([]);
    const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | number | null>(null);
    const [form, setForm] = useState<UnitPayload>(emptyForm);
    const [externalLinkDraft, setExternalLinkDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [wizardStep, setWizardStep] = useState<1 | 2>(1);
    const [nextCodePreview, setNextCodePreview] = useState('V-1000');

    const [publishTarget, setPublishTarget] = useState<UnitRow | null>(null);
    const [publishPlaces, setPublishPlaces] = useState<
        Array<{ name: string; link: string }>
    >([{ name: '', link: '' }]);
    const [publishSaving, setPublishSaving] = useState(false);

    const defaultTab: TabKey = isPublisherPortal ? 'requests' : 'my_units';
    const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
    const [viewType, setViewType] = useState<'grid' | 'list'>('grid');

    const refreshSavedUnitIds = useCallback(() => {
        setSavedUnitIds(new Set(getSavedUnits().map((x) => Number(x.id))));
    }, []);

    const handleToggleSaveUnit = useCallback((u: UnitRow) => {
        if (!isSales) {
            toast.error(t('saved.salesOnlyHint', { defaultValue: 'Saved items are available for sales only' }));
            return;
        }
        const nextSaved = toggleSavedUnit({
            id: Number(u.id),
            code: String(u.code || ''),
            projectName: u.projectName || undefined,
        });
        refreshSavedUnitIds();
        toast.success(
            nextSaved
                ? t('saved.savedUnitSuccess', { defaultValue: 'Unit saved' })
                : t('saved.unsavedUnitSuccess', { defaultValue: 'Unit removed from saved' }),
        );
    }, [isSales, refreshSavedUnitIds, t]);

    const selectTab = useCallback(
        (key: TabKey) => {
            setActiveTab(key);
            setInventorySearch('');
            setSelectedSalesId('all');
            setSelectedTeamId('all');
            const syncUrl: TabKey[] = [
                'my_units',
                'inventory',
                'previews',
                'incoming_requests',
                'requests',
                'awaiting_marketing',
                'published',
            ];
            if (syncUrl.includes(key)) {
                setSearchParams({ tab: key }, { replace: true });
            }
        },
        [setSearchParams],
    );

    useEffect(() => {
        const q = searchParams.get('tab') as TabKey | null;
        if (!q) {
            setActiveTab(defaultTab);
            return;
        }
        const allowed: TabKey[] = isPublisherPortal
            ? ['requests', 'published']
            : isSales
                ? ['my_units', 'inventory', 'previews', 'incoming_requests']
                : isOperationApprover
                    ? ['my_units', 'inventory', 'requests', 'awaiting_marketing', 'previews', 'incoming_requests']
                    : ['my_units', 'inventory', 'awaiting_marketing', 'previews', 'incoming_requests'];
        if (allowed.includes(q)) {
            setActiveTab(q);
        }
    }, [searchParams, defaultTab, isPublisherPortal, isSales, isOperationApprover]);

    // --- Preview state ---
    const [previews, setPreviews] = useState<PreviewRow[]>([]);
    const [previewsLoading, setPreviewsLoading] = useState(false);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [previewForm, setPreviewForm] = useState<PreviewPayload>({ ...emptyPreviewForm });
    const [previewPhoneDial, setPreviewPhoneDial] = useState('+20');
    const [previewSaving, setPreviewSaving] = useState(false);
    /** Live overlap check for Request preview modal (inventory) */
    const [previewSlotCheck, setPreviewSlotCheck] = useState<{
        loading: boolean;
        result: PreviewAvailability | null;
    }>({ loading: false, result: null });
    /** `${previewId}:in` | `:out` while fetching GPS / saving check-in or check-out */
    const [previewGpsAction, setPreviewGpsAction] = useState<string | null>(null);
    const [incomingPreviews, setIncomingPreviews] = useState<PreviewRow[]>([]);
    const [incomingLoading, setIncomingLoading] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectTarget, setRejectTarget] = useState<UnitRow | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [rejectSaving, setRejectSaving] = useState(false);

    const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = useMemo(() => {
        if (isPublisherPortal) {
            return [
                { key: 'requests', label: t('units.publishRequests'), icon: <Clock className="w-4 h-4" /> },
                { key: 'published', label: t('units.publishedInventory'), icon: <CheckCircle2 className="w-4 h-4" /> },
            ];
        }
        const tabDefs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
            { key: 'my_units', label: t('units.myUnits'), icon: <Plus className="w-4 h-4" /> },
            { key: 'inventory', label: t('units.inventory'), icon: <CheckCircle2 className="w-4 h-4" /> },
            ...(isOperationApprover ? [{ key: 'requests' as TabKey, label: t('units.publishRequests'), icon: <Clock className="w-4 h-4" /> }] : []),
            { key: 'awaiting_marketing', label: t('units.awaitingMarketingPublish'), icon: <Clock className="w-4 h-4" /> },
            { key: 'previews', label: t('units.myPreviews'), icon: <Eye className="w-4 h-4" /> },
            { key: 'incoming_requests', label: t('units.incomingRequests'), icon: <Clock className="w-4 h-4" /> },
        ];
        return tabDefs;
    }, [isPublisherPortal, isOperationApprover, t]);

    const ownerIdOf = (u: UnitRow) =>
        u.createdBy != null ? String(u.createdBy) : u.creator?.id != null ? String(u.creator.id) : '';
    const approvalOf = (u: UnitRow) => {
        if (u.isPublished) return 'approved_for_marketing';
        const direct = String(u.approvalStatus || '').trim();
        if (direct) return direct;
        if (!u.publishedLink) return 'pending_operation';
        try {
            const parsed = JSON.parse(u.publishedLink);
            const wf = String((parsed as any)?.workflow || '').trim();
            if (wf) return wf;
        } catch {
            // ignore malformed legacy values
        }
        return 'pending_operation';
    };

    const filteredUnits = useMemo(() => {
        const q = inventorySearch.trim().toLowerCase();
        const qNorm = normalizeSearchValue(q);
        const matchesSearch = (u: UnitRow) => {
            if (!q) return true;
            const fields = [
                u.code,
                u.description,
                u.projectName,
                u.location,
                u.address,
            ].map((v) => String(v ?? ''));
            const rawHaystack = fields.join(' ').toLowerCase();
            if (rawHaystack.includes(q)) return true;
            if (!qNorm) return false;
            return fields.some((v) => normalizeSearchValue(v).includes(qNorm));
        };
        if (activeTab === 'my_units') {
            return units.filter((u) => {
                if (isPublisherPortal) return false;
                const ownerId = ownerIdOf(u);
                /** All roles: every unit you created, published or still in draft */
                return ownerId === currentUserId && matchesSearch(u);
            });
        }
        if (activeTab === 'inventory') {
            return units.filter((u) => Boolean(u.isPublished) && matchesSearch(u));
        }
        if (activeTab === 'requests') {
            if (isPublisherPortal) {
                return units.filter(
                    (u) => !u.isPublished && approvalOf(u) === 'approved_for_marketing' && matchesSearch(u),
                );
            }
            if (isOperationApprover) {
                return units.filter(
                    (u) =>
                        !u.isPublished &&
                        approvalOf(u) === 'pending_operation' &&
                        String(u.creator?.role?.name || '').toLowerCase() === 'sales' &&
                        matchesSearch(u),
                );
            }
            return [];
        }
        if (activeTab === 'published') {
            return units.filter((u) => u.isPublished && matchesSearch(u));
        }
        if (activeTab === 'awaiting_marketing') {
            return units.filter(
                (u) => !u.isPublished && approvalOf(u) === 'approved_for_marketing' && matchesSearch(u),
            );
        }
        return units.filter((u) => matchesSearch(u));
    }, [units, activeTab, currentUserId, isPublisherPortal, isOperationApprover, inventorySearch]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const shouldApplyInventoryFilters =
                (activeTab === 'my_units' ||
                activeTab === 'inventory' ||
                activeTab === 'requests' ||
                activeTab === 'awaiting_marketing' ||
                activeTab === 'published');
            const publishedOnly = activeTab === 'inventory' || activeTab === 'published';
            const data = await getUnits(
                shouldApplyInventoryFilters
                    ? {
                        q: inventorySearch.trim() || undefined,
                        salesId: selectedSalesId !== 'all' ? selectedSalesId : undefined,
                        teamId: selectedTeamId !== 'all' ? selectedTeamId : undefined,
                        ...(publishedOnly ? { publishedOnly: true } : {}),
                    }
                    : undefined,
            );
            const list = Array.isArray(data) ? data : data?.data ?? [];
            setUnits(list);
        } catch (e: any) {
            // Ignore auth errors during logout
            if (e?.response?.status !== 401 && e?.message !== 'SESSION_EXPIRED') {
                toast.error(e?.response?.data?.message || 'Failed to load units');
            }
            setUnits([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, inventorySearch, selectedSalesId, selectedTeamId]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!canInventory) return;
        const loadFilterOptions = async () => {
            try {
                const [salesData, teamsData] = await Promise.all([
                    getUsersByRole('sales'),
                    getAllTeams(),
                ]);
                setSalesOptions(Array.isArray(salesData) ? salesData : []);
                setTeamOptions(Array.isArray(teamsData) ? teamsData : []);
            } catch {
                setSalesOptions([]);
                setTeamOptions([]);
            }
        };
        void loadFilterOptions();
    }, [canInventory]);

    const loadPreviews = useCallback(
        async (opts?: { silent?: boolean }) => {
            const silent = opts?.silent === true;
            if (!silent) setPreviewsLoading(true);
            try {
                const uid = Number(currentUserId);
                if (!Number.isFinite(uid) || uid < 1) {
                    setPreviews([]);
                    return;
                }
                const list = await getUnitPreviews({
                    requestedById: uid,
                    q: inventorySearch.trim() || undefined,
                    salesId: selectedSalesId !== 'all' ? selectedSalesId : undefined,
                    teamId: selectedTeamId !== 'all' ? selectedTeamId : undefined,
                });
                setPreviews(Array.isArray(list) ? list : []);
            } catch {
                if (!silent) setPreviews([]);
            } finally {
                if (!silent) setPreviewsLoading(false);
            }
        },
        [currentUserId, inventorySearch, selectedSalesId, selectedTeamId],
    );

    const loadIncoming = useCallback(async (opts?: { silent?: boolean }) => {
        const silent = opts?.silent === true;
        if (!silent) setIncomingLoading(true);
        try {
            const list = await getMyUnitsPreviewRequests({
                q: inventorySearch.trim() || undefined,
                salesId: selectedSalesId !== 'all' ? selectedSalesId : undefined,
                teamId: selectedTeamId !== 'all' ? selectedTeamId : undefined,
            });
            setIncomingPreviews(Array.isArray(list) ? list : []);
        } catch {
            if (!silent) setIncomingPreviews([]);
        } finally {
            if (!silent) setIncomingLoading(false);
        }
    }, [inventorySearch, selectedSalesId, selectedTeamId]);

    /** Tab badges stay accurate: fetch both lists in the background (not only when that tab is open). */
    const refreshPreviewsForBadges = useCallback(() => {
        void loadPreviews({ silent: true });
        void loadIncoming({ silent: true });
    }, [loadPreviews, loadIncoming]);

    useEffect(() => {
        if (isPublisherPortal) return;
        refreshPreviewsForBadges();
        const unsub = subscribeUnitPreviewActivity(refreshPreviewsForBadges);
        const intervalId = window.setInterval(refreshPreviewsForBadges, 40_000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refreshPreviewsForBadges();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            unsub();
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isPublisherPortal, refreshPreviewsForBadges]);

    useEffect(() => {
        if (activeTab === 'previews') loadPreviews();
        if (activeTab === 'incoming_requests') loadIncoming();
    }, [activeTab, loadPreviews, loadIncoming]);

    const closePreviewModal = useCallback(() => {
        setPreviewModalOpen(false);
        setPreviewPhoneDial('+20');
        setPreviewSlotCheck({ loading: false, result: null });
    }, []);

    useEffect(() => {
        if (!previewModalOpen) return;

        if (!previewForm.unitId || !previewForm.scheduledAt?.trim()) {
            setPreviewSlotCheck({ loading: false, result: null });
            return;
        }

        let cancelled = false;
        const t = window.setTimeout(() => {
            setPreviewSlotCheck({ loading: true, result: null });
            (async () => {
                try {
                    const res = await checkUnitPreviewAvailability({
                        unitId: previewForm.unitId,
                        scheduledAt: previewForm.scheduledAt,
                        durationMin: previewForm.durationMin ?? 60,
                    });
                    if (!cancelled) setPreviewSlotCheck({ loading: false, result: res });
                } catch {
                    if (!cancelled) setPreviewSlotCheck({ loading: false, result: null });
                }
            })();
        }, 450);

        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [previewModalOpen, previewForm.unitId, previewForm.scheduledAt, previewForm.durationMin]);

    const submitPreviewRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!previewForm.clientName.trim()) { toast.error('Client name is required'); return; }
        if (!previewForm.scheduledAt) { toast.error('Scheduled date/time is required'); return; }
        if (previewSlotCheck.loading || (previewForm.scheduledAt?.trim() && !previewSlotCheck.result)) {
            toast.info(t('units.previewRequest.checkingAvailability'));
            return;
        }
        if (previewSlotCheck.result && previewSlotCheck.result.available === false) {
            const c = previewSlotCheck.result.conflict;
            toast.error(
                c?.assignedToName
                    ? `${t('units.previewRequest.slotUnavailablePrefix')} ${c.assignedToName} ${t('units.previewRequest.slotUnavailableMiddle')}.`
                    : t('units.previewRequest.slotUnavailablePrefix'),
            );
            return;
        }
        const unitForPreview = units.find((u) => Number(u.id) === Number(previewForm.unitId));
        if (unitForPreview != null && !unitForPreview.isPublished) {
            toast.error('Previews are only for published units. Publish this listing first or close and pick another unit.');
            return;
        }
        setPreviewSaving(true);
        try {
            const fullPhone = combinePreviewInternationalPhone(
                previewPhoneDial,
                previewForm.clientPhone ?? '',
            );
            const created = await createUnitPreview({
                ...previewForm,
                clientName: previewForm.clientName.trim(),
                clientPhone: fullPhone,
                notes: previewForm.notes?.trim() || undefined,
            });
            const direct = (created as PreviewRow | undefined)?.status === 'scheduled';
            toast.success(
                direct
                    ? t('units.previewRequest.toastScheduledDirect')
                    : t('units.previewRequest.toastSentAwaitApproval'),
            );
            closePreviewModal();
            setPreviewForm({ ...emptyPreviewForm });
            refreshPreviewsForBadges();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Failed to create preview request');
        } finally {
            setPreviewSaving(false);
        }
    };

    const previewGpsBusy = (id: string | number, kind: 'in' | 'out') =>
        previewGpsAction === `${String(id)}:${kind}`;
    const previewTargetUnit = units.find((u) => Number(u.id) === Number(previewForm.unitId));
    const previewIsOwnUnit =
        previewTargetUnit != null && ownerIdOf(previewTargetUnit) !== '' && ownerIdOf(previewTargetUnit) === currentUserId;

    const handleCheckIn = async (p: PreviewRow) => {
        const key = `${String(p.id)}:in`;
        setPreviewGpsAction(key);
        try {
            toast.info(t('units.previewRequest.toastGettingGpsIn'));
            const gps = await getCurrentLocationForPreview();
            await checkInUnitPreview(p.id, gps.lat, gps.lng);
            const acc =
                gps.accuracyM != null
                    ? ` Estimated accuracy ±${Math.round(gps.accuracyM)} m.`
                    : '';
            toast.success(
                t('units.previewRequest.toastCheckedIn', { acc }),
            );
            refreshPreviewsForBadges();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as any).response?.data?.message
                    : err instanceof Error
                        ? err.message
                        : t('units.previewRequest.toastCheckInFailed');
            toast.error(typeof msg === 'string' ? msg : t('units.previewRequest.toastCheckInFailed'));
        } finally {
            setPreviewGpsAction(null);
        }
    };

    const handleCheckOut = async (p: PreviewRow) => {
        const key = `${String(p.id)}:out`;
        setPreviewGpsAction(key);
        try {
            toast.info(t('units.previewRequest.toastGettingGpsOut'));
            const gps = await getCurrentLocationForPreview();
            await checkOutUnitPreview(p.id, gps.lat, gps.lng);
            const acc =
                gps.accuracyM != null
                    ? ` Estimated accuracy ±${Math.round(gps.accuracyM)} m.`
                    : '';
            toast.success(
                t('units.previewRequest.toastCheckedOut', { acc }),
            );
            refreshPreviewsForBadges();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as any).response?.data?.message
                    : err instanceof Error
                        ? err.message
                        : t('units.previewRequest.toastCheckOutFailed');
            toast.error(typeof msg === 'string' ? msg : t('units.previewRequest.toastCheckOutFailed'));
        } finally {
            setPreviewGpsAction(null);
        }
    };

    const handleCancelPreview = async (p: PreviewRow) => {
        if (!window.confirm('Cancel this preview request?')) return;
        try {
            await cancelUnitPreview(p.id);
            toast.success('Preview cancelled');
            refreshPreviewsForBadges();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Cancel failed');
        }
    };

    const handleApprovePreview = async (p: PreviewRow) => {
        try {
            await approveUnitPreview(p.id);
            toast.success(
                'Preview approved — scheduled. The requester checks in and out with GPS from My Previews.',
            );
            refreshPreviewsForBadges();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Approve failed');
        }
    };

    const handleRejectPreview = async (p: PreviewRow) => {
        if (!window.confirm('Reject this preview request?')) return;
        try {
            await rejectUnitPreview(p.id);
            toast.success('Preview rejected');
            refreshPreviewsForBadges();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Reject failed');
        }
    };

    const openCreate = () => {
        if (!canInventory) return;
        setEditingId(null);
        setForm({ ...emptyForm });
        setNextCodePreview(unitCodeAutoPatternPreview(emptyForm.unitType));
        setExternalLinkDraft('');
        setWizardStep(1);
        setModalOpen(true);
    };

    const openEdit = (u: UnitRow) => {
        if (!canInventory) return;
        setEditingId(u.id);
        setForm(unitToForm(u));
        setExternalLinkDraft('');
        setWizardStep(2);
        setModalOpen(true);
    };

    useEffect(() => {
        const editId = searchParams.get('edit');
        if (!editId) return;
        const target = units.find((u) => String(u.id) === String(editId));
        if (!target) return;
        if (!canInventory) return;
        openEdit(target);
        const next = new URLSearchParams(searchParams);
        next.delete('edit');
        setSearchParams(next, { replace: true });
    }, [searchParams, units, canInventory, setSearchParams]);

    const refreshUnitCode = useCallback(async () => {
        try {
            const res = await getNextUnitCode(form.unitType);
            const code = (res?.code || '').trim();
            setNextCodePreview(code || unitCodeAutoPatternPreview(form.unitType));
        } catch {
            setNextCodePreview(unitCodeAutoPatternPreview(form.unitType));
        }
    }, [form.unitType]);

    useEffect(() => {
        if (!modalOpen || editingId != null) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await getNextUnitCode(form.unitType);
                if (cancelled) return;
                const code = (res?.code || '').trim();
                setNextCodePreview(code || unitCodeAutoPatternPreview(form.unitType));
            } catch {
                if (!cancelled) {
                    setNextCodePreview(unitCodeAutoPatternPreview(form.unitType));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [modalOpen, editingId, form.unitType]);

    const openPublish = (u: UnitRow) => {
        const links = parsePublishedLinks(u.publishedLink || '');
        setPublishTarget(u);
        setPublishPlaces(links.places.length > 0 ? links.places : [{ name: '', link: '' }]);
        setPublishSaving(false);
    };

    const closePublish = () => {
        setPublishTarget(null);
        setPublishPlaces([{ name: '', link: '' }]);
    };

    const submitPublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!publishTarget) return;
        const places = publishPlaces
            .map((p) => ({ name: p.name.trim(), link: p.link.trim() }))
            .filter((p) => p.name && p.link);
        const nextIsPublished = places.length > 0;
        setPublishSaving(true);
        try {
            const publishedLink = nextIsPublished ? JSON.stringify({ places }) : undefined;
            await publishUnit(publishTarget.id, {
                isPublished: nextIsPublished,
                publishedLink,
            });
            toast.success(
                nextIsPublished ? t('units.publishModal.successPublished') : t('units.publishModal.successCleared'),
            );
            closePublish();
            load();
        } catch (err: any) {
            toast.error(
                err?.response?.data?.message?.[0] ||
                err?.response?.data?.message ||
                t('units.publishModal.errorUpdate'),
            );
        } finally {
            setPublishSaving(false);
        }
    };

    const handleApproveUnit = async (u: UnitRow) => {
        try {
            await reviewUnitApproval(u.id, { decision: 'approve' });
            toast.success(t('units.approvalApproved') || 'Unit approved and sent to marketing');
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || (t('units.approvalFailed') || 'Approval failed'));
        }
    };

    const handleRejectUnit = async (u: UnitRow) => {
        setRejectTarget(u);
        setRejectReason('');
        setRejectModalOpen(true);
    };

    const handleConfirmRejectUnit = async () => {
        if (!rejectTarget) return;
        const reason = rejectReason.trim();
        if (!reason) {
            toast.error(t('units.rejectReasonRequired'));
            return;
        }
        setRejectSaving(true);
        try {
            await reviewUnitApproval(rejectTarget.id, {
                decision: 'reject',
                note: reason,
            });
            toast.success(t('units.approvalRejected') || 'Unit rejected');
            setRejectModalOpen(false);
            setRejectTarget(null);
            setRejectReason('');
            load();
        } catch (err: any) {
            const msg = err?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg[0] : msg || (t('units.approvalFailed') || 'Rejection failed'));
        } finally {
            setRejectSaving(false);
        }
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingId(null);
        setForm({ ...emptyForm });
        setExternalLinkDraft('');
    };

    const addExternalLinkRow = () => {
        const trimmed = externalLinkDraft.trim();
        if (!trimmed) return;
        try {
            const u = new URL(trimmed);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('bad');
        } catch {
            toast.error(t('units.unitModal.toastUrlInvalid'));
            return;
        }
        const list = form.externalLinks ?? [];
        if (list.includes(trimmed)) {
            toast.info(t('units.unitModal.toastLinkExists'));
            return;
        }
        if (list.length >= 32) {
            toast.error(t('units.unitModal.toastMaxLinks'));
            return;
        }
        setForm({ ...form, externalLinks: [...list, trimmed] });
        setExternalLinkDraft('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.description.trim()) {
            toast.error(t('units.unitModal.toastDescriptionRequired'));
            return;
        }
        setSaving(true);
        try {
            if (editingId != null) {
                await updateUnit(editingId, payloadForApi(form, true));
                toast.success(t('units.unitModal.toastUnitUpdated'));
            } else {
                const body = payloadForApi(form, false) as UnitPayload;
                if (!body.deliveryDate) delete (body as any).deliveryDate;
                delete (body as any).code;
                const created = (await createUnit(body)) as { code?: string };
                const createdCode = typeof created?.code === 'string' ? created.code.trim() : '';
                toast.success(
                    createdCode
                        ? t('units.unitModal.toastUnitCreatedWithCode', { code: createdCode })
                        : t('units.unitModal.toastUnitCreated'),
                );
            }
            closeModal();
            load();
        } catch (err: any) {
            const apiMessage = err?.response?.data?.message;
            toast.error(Array.isArray(apiMessage) ? apiMessage[0] : apiMessage || t('units.unitModal.toastSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (u: UnitRow) => {
        if (!canInventory) return;
        if (!window.confirm(`Delete unit ${u.code}? This cannot be undone.`)) return;
        try {
            await deleteUnit(u.id);
            toast.success('Unit deleted');
            load();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'Delete failed');
        }
    };

    const showAddButton = canInventory && activeTab === 'my_units' && !isPublisherPortal;
    const showPublishAction =
        isMarketing && canPublish && (activeTab === 'requests' || (activeTab === 'my_units' && !isPublisherPortal));
    const showApproveRejectAction = isOperationApprover && activeTab === 'requests';
    const showEditDelete =
        canInventory &&
        !isPublisherPortal &&
        (activeTab === 'my_units' ||
            (isSuperAdmin && (activeTab === 'inventory' || activeTab === 'published' || activeTab === 'requests')));
    /** Table + expandable rows: includes Publish requests so publisher portal matches inventory table UX */
    const useInventoryTable =
        activeTab === 'my_units' ||
        activeTab === 'inventory' ||
        activeTab === 'awaiting_marketing' ||
        activeTab === 'published' ||
        activeTab === 'requests';

    const tabCounts = useMemo(() => {
        const inventoryTotal = units.filter((u) => !!u.isPublished).length;
        const published = units.filter((u) => u.isPublished).length;
        const unpublished = units.filter(
            (u) =>
                !u.isPublished &&
                approvalOf(u) === 'pending_operation' &&
                String(u.creator?.role?.name || '').toLowerCase() === 'sales',
        ).length;
        const approvedForMarketing = units.filter((u) => !u.isPublished && approvalOf(u) === 'approved_for_marketing').length;
        const myUnits = units.filter((u) => {
            if (isPublisherPortal) return false;
            const ownerId = ownerIdOf(u);
            return ownerId === currentUserId;
        }).length;
        const previewCount = previews.length;
        const incomingCount = incomingPreviews.length;
        return { inventoryTotal, published, unpublished, approvedForMarketing, myUnits, previewCount, incomingCount };
    }, [units, currentUserId, isPublisherPortal, previews, incomingPreviews]);

    const statusCounts = useMemo(() => {
        const counts = { available: 0, reserved: 0, sold: 0, unavailable: 0 };
        for (const u of units) {
            const s = (u.status || 'available').toLowerCase() as keyof typeof counts;
            if (s in counts) counts[s]++;
        }
        return counts;
    }, [units]);

    const previewClientFullPhone = combinePreviewInternationalPhone(
        previewPhoneDial,
        previewForm.clientPhone ?? '',
    );
    const previewSmsUnit = units.find((x) => Number(x.id) === Number(previewForm.unitId));
    const previewSmsHref =
        previewClientFullPhone != null
            ? buildSmsHref(
                  previewClientFullPhone,
                  previewSmsUnit?.code
                      ? t('units.previewRequest.smsBodyWithUnit', { code: previewSmsUnit.code })
                      : t('units.previewRequest.smsBodyDefault'),
              )
            : null;

    return (
        <div className="p-3 sm:p-4 md:p-8 space-y-6 md:space-y-8" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Stats Header */}
            <div className="flex flex-col lg:flex-row justify-between items-center bg-white dark:bg-sira-bg-card p-4 sm:p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-slate-50 dark:border-sira-border shadow-sm gap-4 sm:gap-6 md:gap-8">
                <div className="flex gap-3 flex-wrap">
                    <div className="bg-slate-100 dark:bg-foreground/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-500/20 text-center">
                        <p className="mb-1 text-[8px] font-black uppercase text-slate-700 dark:text-slate-300">{t('units.inventory')}</p>
                        <p className="text-xl font-black text-[#0B1828] dark:text-white">{tabCounts.inventoryTotal}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-500/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-emerald-100 dark:border-emerald-500/20 text-center">
                        <p className="mb-1 text-[8px] font-black uppercase text-emerald-800 dark:text-emerald-300">Available</p>
                        <p className="text-xl font-black text-[#0B1828] dark:text-white">{statusCounts.available}</p>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-500/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-amber-100 dark:border-amber-500/20 text-center">
                        <p className="mb-1 text-[8px] font-black uppercase text-amber-800 dark:text-amber-300">Reserved</p>
                        <p className="text-xl font-black text-[#0B1828] dark:text-white">{statusCounts.reserved}</p>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-500/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-rose-100 dark:border-rose-500/20 text-center">
                        <p className="mb-1 text-[8px] font-black uppercase text-rose-800 dark:text-rose-300">Sold</p>
                        <p className="text-xl font-black text-[#0B1828] dark:text-white">{statusCounts.sold}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-500/10 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-500/20 text-center">
                        <p className="mb-1 text-[8px] font-black uppercase text-slate-600 dark:text-slate-400">Unavailable</p>
                        <p className="text-xl font-black text-[#0B1828] dark:text-white">{statusCounts.unavailable}</p>
                    </div>
                </div>
                <div className={isRtl ? 'text-right' : 'text-left'}>
                    <h1 className="text-2xl font-black text-[#0B1828] dark:text-white">
                        {t('units.title')}
                    </h1>
                    <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                        {t('units.rosterSubtitle')}
                    </p>
                </div>
            </div>

            {/* Control Bar */}
            <div className="bg-white dark:bg-sira-bg-card p-4 sm:p-5 rounded-[1.75rem] sm:rounded-[2.75rem] shadow-sm border border-slate-50 dark:border-sira-border flex flex-col md:flex-row justify-between items-start gap-4">
                <div className="flex w-full min-w-0 flex-wrap items-start gap-2 sm:gap-3">
                    {showAddButton && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="bg-[#0B1828] text-white px-6 py-3.5 rounded-xl font-black text-[10px] shadow-lg flex items-center gap-2 active:scale-95 transition-all"
                        >
                            <Plus size={16} /> {t('units.addUnit') || 'Add Unit'}
                        </button>
                    )}
                    {useInventoryTable && (
                        <div className="flex bg-slate-50 dark:bg-foreground/5 p-1 rounded-2xl border border-slate-100 dark:border-sira-border">
                            <button onClick={() => setViewType('list')} className={`p-2 rounded-lg transition-all ${viewType === 'list' ? 'bg-white dark:bg-foreground/10 text-[#0B1828] dark:text-foreground shadow-sm' : 'text-slate-300'}`}><List size={16} /></button>
                            <button onClick={() => setViewType('grid')} className={`p-2 rounded-lg transition-all ${viewType === 'grid' ? 'bg-white dark:bg-foreground/10 text-[#0B1828] dark:text-foreground shadow-sm' : 'text-slate-300'}`}><Grid2X2 size={16} /></button>
                        </div>
                    )}
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-0.5 bg-slate-50 dark:bg-foreground/5 p-1.5 sm:p-2 sm:gap-1 rounded-2xl sm:rounded-[999px] border border-slate-100 dark:border-sira-border overflow-hidden">
                        {tabs.map((tab) => {
                            const count =
                                tab.key === 'my_units' ? tabCounts.myUnits
                                    : tab.key === 'inventory' ? tabCounts.inventoryTotal
                                        : tab.key === 'requests' ? (isPublisherPortal ? tabCounts.approvedForMarketing : tabCounts.unpublished)
                                            : tab.key === 'awaiting_marketing' ? tabCounts.approvedForMarketing
                                            : tab.key === 'published' ? tabCounts.published
                                                : tab.key === 'previews' ? tabCounts.previewCount
                                                    : tab.key === 'incoming_requests' ? tabCounts.incomingCount
                                                        : 0;
                            const active = activeTab === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => selectTab(tab.key)}
                                    className={`shrink-0 px-3 sm:px-4 py-2 rounded-[10px] sm:rounded-xl text-[10px] font-black transition-colors inline-flex items-center gap-1.5 max-w-full ${active
                                        ? 'bg-[#0B1828] text-white shadow-none'
                                        : 'text-slate-400 hover:bg-white dark:hover:bg-foreground/10 hover:text-[#0B1828] dark:hover:text-foreground'
                                        }`}
                                >
                                    {tab.icon &&
                                        React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, {
                                            className: 'w-3.5 h-3.5',
                                        })}
                                    <span>{tab.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-black ${active ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-foreground/10 text-slate-500'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex w-full md:w-auto items-start gap-3 flex-wrap self-start md:self-start">
                    <div className="relative w-full md:w-[22rem]">
                        <Search className={`absolute ${isRtl ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 text-slate-300`} size={16} />
                        <input
                            type="text"
                            placeholder={t('units.searchPlaceholder') || 'Search by unit code or project...'}
                            value={inventorySearch}
                            onChange={(e) => setInventorySearch(e.target.value)}
                            className={`w-full bg-slate-50/50 dark:bg-foreground/5 border border-slate-50 dark:border-sira-border rounded-xl py-3 ${isRtl ? 'pr-12 pl-6' : 'pl-12 pr-6'} text-xs font-bold outline-none text-foreground`}
                        />
                    </div>
                    {canFilterByTeam && (
                        <select
                            value={selectedTeamId || ''}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            className="h-11 cursor-pointer rounded-xl border border-slate-50 dark:border-sira-border bg-slate-50/50 dark:bg-foreground/5 px-4 text-[11px] font-black text-slate-500 outline-none"
                        >
                            <option value="all">{t('units.allTeams')}</option>
                            {teamOptions.map((t) => (
                                <option key={String(t.id)} value={String(t.id)}>
                                    {t.name || `Team #${t.id}`}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            <div className="space-y-8">

            {/* Unit grid (not shown on Previews tab) */}
            {activeTab === 'previews' ? (
                /* ---------- PREVIEWS TAB ---------- */
                previewsLoading ? (
                    <div className="flex items-center justify-center py-24 text-foreground/50 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        {t('units.loadingPreviews')}
                    </div>
                ) : previews.length === 0 ? (
                    <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50/80 p-12 text-center text-sira-text-muted dark:border-sira-border dark:bg-foreground/5 dark:text-foreground/50">
                        <p className="mb-2 font-semibold text-foreground">{t('units.noRequestedPreviews')}</p>
                        <p className="text-sm">
                            {t('units.previewsEmptyHint')}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 bg-sira-bg-card shadow-[var(--shadow-premium-xl)] ring-1 ring-slate-900/[0.04] dark:border-sira-border dark:ring-0">
                        <div className="overflow-x-auto">
                            <table className={`w-full md:min-w-[760px] border-collapse text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/90 text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted italic dark:border-sira-border dark:bg-sira-bg-subtle/50">
                                        <th className="w-16 px-6 py-5 text-start">{t('units.page')}</th>
                                        <th className="px-6 py-5">{t('units.status')}</th>
                                        <th className="px-6 py-5">{t('units.unit')}</th>
                                        <th className="px-6 py-5">{t('units.client')}</th>
                                        <th className="px-6 py-5">{t('units.scheduled')}</th>
                                        <th className="px-6 py-5 text-end">{t('units.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previews.map((pr) => {
                                        const pid = String(pr.id);
                                        const goDetail = () =>
                                            navigate(`/units/previews/${encodeURIComponent(pid)}?from=previews`);
                                        const isMine = String(pr.requestedById) === currentUserId;

                                        return (
                                            <tr
                                                key={pid}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={t('units.openPreviewDetails')}
                                                onClick={goDetail}
                                                className="cursor-pointer border-b border-sira-border/50 transition-colors hover:bg-sira-bg-hover align-middle"
                                            >
                                                <td className="px-6 py-6 text-sira-text-muted">
                                                    <ExternalLink className="h-4 w-4 opacity-80" />
                                                </td>
                                                <td className="px-6 py-6">
                                                    <span className={`inline-block rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${PREVIEW_STATUS_STYLES[pr.status] || ''}`}>
                                                        {t(`previewDetail.status.${pr.status}`, { defaultValue: pr.status })}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <span className="font-mono text-[11px] font-black tracking-tight text-sira-gold bg-sira-gold/5 px-2 py-1 rounded-lg">
                                                        {pr.unit?.code ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="text-[13px] font-black text-sira-text-primary uppercase tracking-tight">{pr.clientName}</div>
                                                    {pr.clientPhone && (
                                                        <div className="text-[10px] font-bold text-sira-text-muted tracking-widest mt-0.5" dir="ltr">
                                                            {pr.clientPhone}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="text-[11px] font-black text-sira-text-secondary uppercase tracking-tight">{fmtDateTime(pr.scheduledAt)}</div>
                                                    {pr.durationMin && (
                                                        <div className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mt-0.5">{pr.durationMin} min</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-6 text-end" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex flex-wrap justify-end gap-2">
                                                        {isMine && pr.status === 'scheduled' && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={previewGpsBusy(pr.id, 'in')}
                                                                    onClick={() => handleCheckIn(pr)}
                                                                    className="h-10 px-4 rounded-xl bg-sira-gold/10 text-sira-gold border border-sira-gold/20 text-[10px] font-black uppercase tracking-widest hover:bg-sira-gold/20 transition-all flex items-center gap-2"
                                                                >
                                                                    {previewGpsBusy(pr.id, 'in') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                                                                    {t('units.checkIn')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCancelPreview(pr)}
                                                                    className="h-10 px-4 rounded-xl bg-red-500/5 text-red-600 border border-red-500/10 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all flex items-center gap-2"
                                                                >
                                                                    <X className="h-3.5 w-3.5" /> {t('common.cancel')}
                                                                </button>
                                                            </>
                                                        )}
                                                        {isMine && pr.status === 'checked_in' && (
                                                            <button
                                                                type="button"
                                                                disabled={previewGpsBusy(pr.id, 'out')}
                                                                onClick={() => handleCheckOut(pr)}
                                                                className="h-10 px-4 rounded-xl bg-sira-green/10 text-sira-green border border-sira-green/20 text-[10px] font-black uppercase tracking-widest hover:bg-sira-green/20 transition-all flex items-center gap-2"
                                                            >
                                                                {previewGpsBusy(pr.id, 'out') ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                                                                {t('units.checkOut')}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : activeTab === 'incoming_requests' ? (
                /* ---------- INCOMING PREVIEW REQUESTS TAB ---------- */
                incomingLoading ? (
                    <div className="flex items-center justify-center gap-2 py-24 text-sira-text-muted">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        {t('units.loadingIncomingRequests')}
                    </div>
                ) : incomingPreviews.length === 0 ? (
                    <div className="rounded-[2.5rem] border border-slate-200 bg-slate-50/80 p-12 text-center text-sira-text-muted dark:border-sira-border dark:bg-foreground/5 dark:text-foreground/50">
                        {t('units.noIncomingRequests')}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100 bg-sira-bg-card shadow-[var(--shadow-premium-xl)] ring-1 ring-slate-900/[0.04] dark:border-sira-border dark:ring-0">
                        <div className="overflow-x-auto">
                            <table className={`w-full md:min-w-[800px] border-collapse text-sm ${isRtl ? 'text-right' : 'text-left'}`}>
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/90 text-[9px] font-black uppercase tracking-[0.25em] text-sira-text-muted italic dark:border-sira-border dark:bg-sira-bg-subtle/50">
                                        <th className="w-16 px-6 py-5 text-start">{t('units.page')}</th>
                                        <th className="px-6 py-5">{t('units.status')}</th>
                                        <th className="px-6 py-5">{t('units.unit')}</th>
                                        <th className="px-6 py-5">{t('units.requester')}</th>
                                        <th className="px-6 py-5">{t('units.client')}</th>
                                        <th className="px-6 py-5">{t('units.scheduled')}</th>
                                        <th className="px-6 py-5 text-end">{t('units.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {incomingPreviews.map((pr) => {
                                        const pid = String(pr.id);
                                        const goDetail = () =>
                                            navigate(`/units/previews/${encodeURIComponent(pid)}?from=incoming`);
                                        return (
                                            <tr
                                                key={pid}
                                                role="button"
                                                tabIndex={0}
                                                aria-label={t('units.openRequestDetails')}
                                                onClick={goDetail}
                                                className="cursor-pointer border-b border-sira-border/50 transition-colors hover:bg-sira-bg-hover align-middle"
                                            >
                                                <td className="px-6 py-6 text-sira-text-muted">
                                                    <ExternalLink className="h-4 w-4 opacity-80" />
                                                </td>
                                                <td className="px-6 py-6">
                                                    <span className={`inline-block rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${PREVIEW_STATUS_STYLES[pr.status] || ''}`}>
                                                        {t(`previewDetail.status.${pr.status}`, { defaultValue: pr.status })}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <span className="font-mono text-[11px] font-black tracking-tight text-sira-gold bg-sira-gold/5 px-2 py-1 rounded-lg">
                                                        {pr.unit?.code ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="text-[13px] font-black text-sira-text-primary uppercase tracking-tight">{previewRequesterName(pr.requestedBy, t)}</div>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="text-[13px] font-black text-sira-text-primary uppercase tracking-tight">{pr.clientName}</div>
                                                    {pr.clientPhone && (
                                                        <div className="text-[10px] font-bold text-sira-text-muted tracking-widest mt-0.5" dir="ltr">
                                                            {pr.clientPhone}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className="text-[11px] font-black text-sira-text-secondary uppercase tracking-tight">{fmtDateTime(pr.scheduledAt)}</div>
                                                    {pr.durationMin && (
                                                        <div className="text-[9px] font-black uppercase tracking-widest text-sira-text-muted mt-0.5">{pr.durationMin} min</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-6 text-end" onClick={(e) => e.stopPropagation()}>
                                                    {pr.status === 'pending' && (
                                                        <div className="flex flex-wrap justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleApprovePreview(pr)}
                                                                className="h-10 px-4 rounded-xl bg-sira-gold/10 text-sira-gold border border-sira-gold/20 text-[10px] font-black uppercase tracking-widest hover:bg-sira-gold/20 transition-all flex items-center gap-2"
                                                            >
                                                                <Check className="h-3.5 w-3.5" /> {t('units.approve')}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRejectPreview(pr)}
                                                                className="h-10 px-4 rounded-xl bg-red-500/5 text-red-600 border border-red-500/10 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all flex items-center gap-2"
                                                            >
                                                                <XCircle className="h-3.5 w-3.5" /> {t('units.reject')}
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : loading ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-4">
                    <div className="w-10 h-10 border-4 border-slate-100 border-t-[#0B1828] rounded-full animate-spin"></div>
                    <p className="text-slate-400 text-xs font-bold">{t('units.loadingUnits')}</p>
                </div>
            ) : filteredUnits.length === 0 ? (
                <div className="bg-white dark:bg-sira-bg-card rounded-[2.5rem] border border-slate-50 dark:border-sira-border shadow-sm p-12 text-center">
                    <Building2 size={40} className="text-slate-200 dark:text-foreground/15 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-sm">
                        {activeTab === 'my_units' && t('units.noUnitsYet')}
                        {activeTab === 'inventory' && t('units.noInventoryUnits')}
                        {activeTab === 'requests' && t('units.noPendingPublishRequests')}
                        {activeTab === 'awaiting_marketing' && t('units.noAwaitingMarketingPublish')}
                        {activeTab === 'published' && t('units.noPublishedUnits')}
                    </p>
                </div>
            ) : useInventoryTable ? (
                viewType === 'grid' ? (
                    /* ---------- SIRA-STYLE GRID VIEW ---------- */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                        {filteredUnits.map((unit) => {
                            const driveHref = resolveDriveMediaLink(unit);
                            return (
                            <div key={String(unit.id)} className="bg-white dark:bg-sira-bg-card rounded-[2.75rem] border border-slate-50 dark:border-sira-border shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col group min-w-0">
                                <div className="p-8 pb-3 text-center relative">
                                    <div className={`absolute top-5 ${isRtl ? 'right-5' : 'left-5'} px-3 py-1.5 rounded-xl text-[9px] font-black text-white ${unitStatusBadgeClass(unit.status, 'solid')}`}>
                                        {UNIT_STATUS_BADGE[(unit.status || 'available').toLowerCase()]?.label || 'AVAILABLE'}
                                    </div>
                                    <div className="w-24 h-24 bg-slate-50 dark:bg-foreground/5 rounded-[1.75rem] flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                                        <Building2 size={36} className="text-slate-200 dark:text-foreground/20" />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-4 py-1 rounded-full">
                                        {getUnitTypeLabel(unit.unitType)}
                                    </span>
                                </div>
                                <div className="px-8 pb-8 space-y-5 flex-1 flex flex-col">
                                    <div className="text-center">
                                        <h3 className="text-xl font-black tracking-tight text-[#0B1828] dark:text-slate-50">{unit.code}</h3>
                                        <p className="mt-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">{unit.projectName || '—'}</p>
                                        {unit.ownerPhone && (
                                            <p className="mt-2 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 rounded-lg inline-block" dir="ltr">
                                                📞 {unit.ownerPhone}
                                            </p>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 border-t border-slate-50 pt-5 text-[11px] dark:border-sira-border">
                                        <div>
                                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t('units.price')}</p>
                                            <p className="mt-0.5 text-sm font-black text-blue-700 dark:text-blue-400">{formatMoney(unit.price)}</p>
                                        </div>
                                        <div className={isRtl ? 'text-right' : 'text-left'}>
                                            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t('units.area')}</p>
                                            <p className="mt-0.5 text-sm font-black text-[#0B1828] dark:text-slate-100">{unit.area ? `${unit.area} m²` : '—'}</p>
                                        </div>
                                    </div>
                                    {driveHref ? (
                                        <a
                                            href={driveHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-[#0B1828] transition-colors hover:border-blue-400 hover:bg-blue-50/90 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-100 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                                        >
                                            <ExternalLink className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                                            <span className="min-w-0 truncate">{t('units.openDriveMedia')}</span>
                                        </a>
                                    ) : null}
                                    <div className="mt-auto flex gap-2.5 pt-2">
                                        <Link
                                            to={`/units/${unit.id}`}
                                            state={{ unitsTab: activeTab }}
                                            className="flex-1 py-3.5 bg-[#0B1828] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 min-h-[2.875rem]"
                                        >
                                            {t('units.openDetails')} <ChevronRight size={16} />
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSaveUnit(unit)}
                                            className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center transition-all ${
                                                savedUnitIds.has(Number(unit.id))
                                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                    : 'bg-slate-50 dark:bg-foreground/5 text-slate-400 hover:text-amber-600'
                                            }`}
                                            title={t('sidebar.saved', { defaultValue: 'Saved' })}
                                        >
                                            <Bookmark size={16} />
                                        </button>
                                        {showEditDelete && (
                                            <button type="button" onClick={() => openEdit(unit)} className="w-12 h-12 shrink-0 bg-slate-50 dark:bg-foreground/5 text-slate-400 rounded-xl flex items-center justify-center hover:text-blue-600 transition-all">
                                                <Pencil size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ---------- SIRA-STYLE LIST VIEW ---------- */
                    <div className="bg-white dark:bg-sira-bg-card rounded-[2.5rem] border border-slate-50 dark:border-sira-border shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className={`w-full ${isRtl ? 'text-right' : 'text-left'} border-collapse text-[11px]`}>
                                <thead className="border-b border-slate-100 bg-slate-50/50 font-black uppercase tracking-widest text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-400">
                                    <tr>
                                        <th className="py-6 px-8">{t('units.code')}</th>
                                        <th className="py-6 px-4">{t('units.unit')}</th>
                                        <th className="py-6 px-4">{t('units.unitModal.unitType') || 'Type'}</th>
                                        <th className="hidden py-6 px-4 md:table-cell">{t('units.area')}</th>
                                        <th className="hidden py-6 px-4 lg:table-cell">{t('units.mediaLink')}</th>
                                        <th className="py-6 px-4">{t('units.price')}</th>
                                        <th className="py-6 px-4">{t('units.status')}</th>
                                        <th className="py-6 px-8 text-center">{t('units.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-sira-border/50">
                                    {filteredUnits.map((unit) => {
                                        const driveHref = resolveDriveMediaLink(unit);
                                        return (
                                        <tr key={String(unit.id)} className="hover:bg-slate-50/30 dark:hover:bg-foreground/5 transition-all group">
                                            <td className="py-5 px-8 font-black text-[#0B1828] dark:text-slate-100">
                                                <div>{unit.code}</div>
                                                {unit.ownerPhone && <div className="text-[9px] text-emerald-600 font-bold mt-1" dir="ltr">📞 {unit.ownerPhone}</div>}
                                            </td>
                                            <td className="py-5 px-4 font-bold text-slate-700 dark:text-slate-300">{unit.projectName || '—'}</td>
                                            <td className="py-5 px-4"><span className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-lg font-black">{getUnitTypeLabel(unit.unitType)}</span></td>
                                            <td className="hidden py-5 px-4 font-bold text-[#0B1828] dark:text-slate-100 md:table-cell">
                                                {unit.area ? `${unit.area} m²` : '—'}
                                            </td>
                                            <td className="hidden py-5 px-4 lg:table-cell">
                                                {driveHref ? (
                                                    <a
                                                        href={driveHref}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex max-w-[11rem] items-center gap-1 truncate text-[11px] font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                        <span className="truncate">{t('units.openDriveMedia')}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[11px] text-slate-500 dark:text-slate-500">—</span>
                                                )}
                                            </td>
                                            <td className="py-5 px-4 font-black text-emerald-700 dark:text-emerald-400">{formatMoney(unit.price)}</td>
                                            <td className="py-5 px-4">
                                                <span className={`px-3 py-1 rounded-lg text-[9px] font-black ${unitStatusBadgeClass(unit.status)}`}>
                                                    {UNIT_STATUS_BADGE[(unit.status || 'available').toLowerCase()]?.label || 'AVAILABLE'}
                                                </span>
                                            </td>
                                            <td className="py-5 px-8 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <Link to={`/units/${unit.id}`} state={{ unitsTab: activeTab }} className="w-8 h-8 bg-[#0B1828] text-white rounded-lg flex items-center justify-center shadow-lg"><Eye size={14} /></Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleSaveUnit(unit)}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                                            savedUnitIds.has(Number(unit.id))
                                                                ? 'bg-amber-100 text-amber-700'
                                                                : 'bg-slate-50 dark:bg-foreground/5 text-slate-500 hover:bg-amber-50 hover:text-amber-700'
                                                        }`}
                                                        title={t('sidebar.saved', { defaultValue: 'Saved' })}
                                                    >
                                                        <Bookmark size={14} />
                                                    </button>
                                                    {showPublishAction && !unit.isPublished && (
                                                        <button type="button" onClick={() => openPublish(unit)} className="w-8 h-8 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded-lg flex items-center justify-center"><Megaphone size={14} /></button>
                                                    )}
                                                    {showApproveRejectAction && (
                                                        <>
                                                            <button type="button" onClick={() => handleApproveUnit(unit)} className="w-8 h-8 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-lg flex items-center justify-center"><Check size={14} /></button>
                                                            <button type="button" onClick={() => handleRejectUnit(unit)} className="w-8 h-8 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center"><XCircle size={14} /></button>
                                                        </>
                                                    )}
                                                    {showEditDelete && (
                                                        <>
                                                            <button type="button" onClick={() => openEdit(unit)} className="w-8 h-8 bg-slate-50 dark:bg-foreground/5 text-slate-400 rounded-lg flex items-center justify-center hover:text-blue-600 transition-all"><Pencil size={14} /></button>
                                                            <button type="button" onClick={() => handleDelete(unit)} className="w-8 h-8 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={14} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
                    {filteredUnits.map((unit) => {
                        const driveHref = resolveDriveMediaLink(unit);
                        return (
                        <div key={String(unit.id)} className="bg-white dark:bg-sira-bg-card rounded-[2.75rem] border border-slate-50 dark:border-sira-border shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col group min-w-0">
                            <div className="p-8 pb-3 text-center relative">
                                <div className={`absolute top-5 ${isRtl ? 'right-5' : 'left-5'} px-3 py-1.5 rounded-xl text-[9px] font-black text-white ${unitStatusBadgeClass(unit.status, 'solid')}`}>
                                    {UNIT_STATUS_BADGE[(unit.status || 'available').toLowerCase()]?.label || 'AVAILABLE'}
                                </div>
                                <div className="w-24 h-24 bg-slate-50 dark:bg-foreground/5 rounded-[1.75rem] flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform">
                                    <Building2 size={36} className="text-slate-200 dark:text-foreground/20" />
                                </div>
                                <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-4 py-1 rounded-full">{getUnitTypeLabel(unit.unitType)}</span>
                            </div>
                            <div className="px-8 pb-8 space-y-5 flex-1 flex flex-col">
                                <div className="text-center">
                                    <h3 className="text-xl font-black tracking-tight text-[#0B1828] dark:text-slate-50">{unit.code}</h3>
                                    <p className="mt-1 text-[11px] font-bold text-slate-600 dark:text-slate-400">{unit.projectName || '—'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 border-t border-slate-50 pt-5 text-[11px] dark:border-sira-border">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t('units.price')}</p>
                                        <p className="mt-0.5 text-sm font-black text-blue-700 dark:text-blue-400">{formatMoney(unit.price)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">{t('units.area')}</p>
                                        <p className="mt-0.5 text-sm font-black text-[#0B1828] dark:text-slate-100">{unit.area ? `${unit.area} m²` : '—'}</p>
                                    </div>
                                </div>
                                {driveHref ? (
                                    <a
                                        href={driveHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-bold text-[#0B1828] transition-colors hover:border-blue-400 hover:bg-blue-50/90 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-100 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                                    >
                                        <ExternalLink className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
                                        <span className="min-w-0 truncate">{t('units.openDriveMedia')}</span>
                                    </a>
                                ) : null}
                                {showApproveRejectAction ? (
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <button
                                            type="button"
                                            onClick={() => handleApproveUnit(unit)}
                                            className="inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-emerald-800 transition-colors hover:bg-emerald-600 hover:text-white dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-600"
                                        >
                                            <Check size={16} aria-hidden />
                                            {t('units.approve')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleRejectUnit(unit)}
                                            className="inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-rose-800 transition-colors hover:bg-rose-600 hover:text-white dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-600"
                                        >
                                            <XCircle size={16} aria-hidden />
                                            {t('units.reject')}
                                        </button>
                                    </div>
                                ) : null}
                                <div className="mt-auto flex gap-2.5">
                                    <Link to={`/units/${unit.id}`} state={{ unitsTab: activeTab }} className="flex-1 py-3.5 bg-[#0B1828] text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-2 min-h-[2.875rem]">
                                        {t('units.openDetails')} <ChevronRight size={16} />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleSaveUnit(unit)}
                                        className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center transition-all ${
                                            savedUnitIds.has(Number(unit.id))
                                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                : 'bg-slate-50 dark:bg-foreground/5 text-slate-400 hover:text-amber-700'
                                        }`}
                                        title={t('sidebar.saved', { defaultValue: 'Saved' })}
                                    >
                                        <Bookmark size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            </div>

            {/* Sira-Style Add/Edit Unit Wizard */}
            {modalOpen &&
                canInventory &&
                createPortal(
                <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6">
                    <div
                        role="presentation"
                        className="modal-backdrop-scrim absolute inset-0"
                        onClick={closeModal}
                        aria-hidden
                    />
                    <div
                        style={{ colorScheme: 'light' }}
                        className="relative z-10 flex w-full max-w-4xl max-h-[min(95vh,calc(100vh-2rem))] flex-col overflow-hidden rounded-[2rem] border border-slate-200/90 bg-white text-[#0B1828] shadow-2xl shadow-slate-400/25 sm:rounded-[2.75rem]"
                    >
                        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 bg-white px-8 py-5 sm:px-10 sm:py-6">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[#0B1828] shadow-sm">
                                    <Building2 size={24} strokeWidth={2.25} />
                                </div>
                                <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                                    {editingId != null ? t('units.unitModal.titleEdit') : t('units.unitModal.titleNew')}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={closeModal}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-[#0B1828]"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-12 space-y-10">
                            {wizardStep === 1 && editingId == null ? (
                                <div className="space-y-10">
                                    <div className="text-center space-y-2">
                                        <h3 className="text-2xl font-black text-[#0B1828] dark:text-foreground">
                                            {t('units.unitModal.selectType')}
                                        </h3>
                                        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                            {t('units.unitModal.selectTypeSubtitle')}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                        {UNIT_TYPE_WIZARD.map((ut) => (
                                            <button
                                                key={ut.value}
                                                type="button"
                                                onClick={() => {
                                                    setForm({ ...form, unitType: ut.value });
                                                    setWizardStep(2);
                                                }}
                                                className="flex flex-col items-center justify-center gap-4 p-8 rounded-[2.5rem] border-2 border-slate-100 dark:border-sira-border hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-foreground/5 transition-all group shadow-sm bg-white dark:bg-sira-bg-card"
                                            >
                                                <span className="text-4xl group-hover:scale-125 transition-transform">{ut.emoji}</span>
                                                <div className="text-center">
                                                    <p className="text-sm font-black text-[#0B1828] dark:text-foreground">{ut.label}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <form id="unit-wizard-form" onSubmit={handleSubmit} className="space-y-10">
                                    {editingId == null && (
                                        <div className="relative flex flex-col justify-between gap-4 overflow-hidden rounded-[2rem] border border-emerald-200/80 bg-emerald-50/90 p-6 shadow-inner sm:flex-row sm:items-center sm:p-8">
                                            <div className="relative z-10 flex items-center gap-5">
                                                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-3xl shadow-sm ring-1 ring-emerald-200/90">
                                                    {UNIT_TYPE_WIZARD.find(u => u.value === form.unitType)?.emoji || '🏠'}
                                                </div>
                                                <div>
                                                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-emerald-900/80">{t('units.unitModal.unitType')}</p>
                                                    <p className="text-xl font-black tracking-tight text-[#0B1828] sm:text-2xl">
                                                        {UNIT_TYPE_WIZARD.find(u => u.value === form.unitType)?.label || getUnitTypeLabel(form.unitType)}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setWizardStep(1)}
                                                className="relative z-10 shrink-0 self-start text-[10px] font-black uppercase tracking-widest text-[#0B1828]/80 underline decoration-slate-300 underline-offset-4 transition hover:text-[#0B1828] hover:decoration-[#0B1828]"
                                            >
                                                {t('units.unitModal.changeType')}
                                            </button>
                                        </div>
                                    )}

                                    {editingId == null && (
                                        <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-emerald-500/10 px-6 py-5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300 mb-1">
                                                        {t('units.unitModal.unitCode')}
                                                    </p>
                                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {t('units.unitModal.unitCodeHintReadonly')}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={refreshUnitCode}
                                                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 shadow-sm transition-all hover:bg-emerald-50 active:scale-90"
                                                    title={t('units.unitModal.regenerateCode') || 'Regenerate Code'}
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            </div>
                                            <p className="mt-3 font-mono text-sm font-black tracking-tight text-[#0B1828] dark:text-emerald-200 break-all">
                                                {nextCodePreview}
                                            </p>
                                        </div>
                                    )}

                                    {editingId != null && (
                                        <div className="bg-slate-50 dark:bg-foreground/5 rounded-2xl p-4 flex items-center gap-3">
                                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest dark:text-slate-400">{t('units.unitModal.unitCode')}:</span>
                                            <span className="font-mono font-black text-[#0B1828] dark:text-foreground">{form.code}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="modal-label">{t('units.unitModal.description')}</label>
                                            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('units.unitModal.description')} className="modal-textarea" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.areaLocation')}</label>
                                            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t('units.unitModal.areaLocationPlaceholder')} className="modal-input" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.projectCompound')}</label>
                                            <input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder={t('units.unitModal.projectCompoundPlaceholder')} className="modal-input" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.unitAddress')}</label>
                                            <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t('units.unitModal.unitAddressPlaceholder')} className="modal-input" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.ownerName') || 'Owner Name'}</label>
                                            <input value={form.ownerName ?? ''} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder={t('units.unitModal.ownerNamePlaceholder') || 'Enter owner name'} className="modal-input" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.ownerPhone') || 'Owner Phone'}</label>
                                            <input value={form.ownerPhone ?? ''} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })} placeholder={t('units.unitModal.ownerPhonePlaceholder') || 'Enter owner phone'} className="modal-input" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="modal-label">{t('units.unitModal.priceEgp')}</label>
                                                <input type="number" min={0} step="0.01" value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:col-span-2">
                                            <div className="space-y-2">
                                                <label className="modal-label">{t('units.unitModal.areaM2')}</label>
                                                <input type="number" min={0} step="0.01" value={form.area ?? ''} onChange={(e) => setForm({ ...form, area: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="modal-label">{t('units.unitModal.beds')}</label>
                                                <input type="number" min={0} value={form.bedrooms ?? ''} onChange={(e) => setForm({ ...form, bedrooms: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="modal-label">{t('units.unitModal.baths')}</label>
                                                <input type="number" min={0} value={form.bathrooms ?? ''} onChange={(e) => setForm({ ...form, bathrooms: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:col-span-2">
                                            <div className="space-y-2">
                                                <label className="modal-label">{t('units.unitModal.floor')}</label>
                                                <input type="number" value={form.floor ?? ''} onChange={(e) => setForm({ ...form, floor: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="modal-label">{t('units.unitModal.monthlyInstallmentEgp')}</label>
                                                <input type="number" min={0} step="0.01" value={form.monthlyInstallment ?? ''} onChange={(e) => setForm({ ...form, monthlyInstallment: e.target.value === '' ? undefined : Number(e.target.value) })} className="modal-input" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest dark:text-slate-400">{t('units.unitModal.status')}</label>
                                                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as UnitPayload['status'] })}>
                                                    <SelectTrigger className="modal-field-select !text-[#0B1828] dark:!text-slate-100">
                                                        <SelectValue placeholder={t('units.unitModal.statusPlaceholder')} />
                                                    </SelectTrigger>
                                                    <SelectContent className="[&_[data-slot='select-item'][data-highlighted]]:bg-[#0B1828] [&_[data-slot='select-item'][data-highlighted]]:text-white">
                                                        <SelectItem value="available" className="data-[highlighted]:text-white">{t('units.unitModal.statusAvailable')}</SelectItem>
                                                        <SelectItem value="reserved" className="data-[highlighted]:text-white">{t('units.unitModal.statusReserved')}</SelectItem>
                                                        <SelectItem value="sold" className="data-[highlighted]:text-white">{t('units.unitModal.statusSold')}</SelectItem>
                                                        <SelectItem value="unavailable" className="data-[highlighted]:text-white">{t('units.unitModal.statusUnavailable')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="modal-label">{t('units.unitModal.deliveryDate')}</label>
                                            <input type="date" value={form.deliveryDate ? String(form.deliveryDate).slice(0, 10) : ''} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value || '' })} className="modal-input" />
                                        </div>
                                        <div className="md:col-span-2 space-y-4 pt-6">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest dark:text-slate-400">{t('units.unitModal.features')}</label>
                                            <div className="flex flex-wrap gap-2">
                                                {AMENITY_PRESETS.map((preset) => {
                                                    const active = (form.amenities ?? []).includes(preset.value);
                                                    return (
                                                        <button key={preset.value} type="button" onClick={() => { const cur = form.amenities ?? []; setForm({ ...form, amenities: active ? cur.filter((x) => x !== preset.value) : [...cur, preset.value] }); }} className={`px-5 py-2.5 rounded-xl text-[10px] font-black transition-all border ${active ? 'border-sky-700 bg-sky-100 text-sky-950' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 dark:border-sira-border dark:bg-sira-bg-card dark:text-slate-200'}`}>
                                                            {t(`units.unitModal.amenities.${preset.i18nKey}`)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2 space-y-2 pt-6">
                                            <label className="modal-label flex items-center gap-2">{t('units.unitModal.driveMediaLink')}</label>
                                            <input type="url" value={form.driveMediaLink} onChange={(e) => setForm({ ...form, driveMediaLink: e.target.value })} placeholder="https://drive.google.com/..." className="modal-input" />
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest dark:text-slate-400">{t('units.unitModal.externalLinks')}</label>
                                            <div className="flex gap-2">
                                                <input type="url" value={externalLinkDraft} onChange={(e) => setExternalLinkDraft(e.target.value)} placeholder={t('units.unitModal.externalLinksPlaceholder')} className="modal-input flex-1" />
                                                <button type="button" onClick={addExternalLinkRow} className="px-6 bg-white dark:bg-foreground/5 border border-slate-200 dark:border-sira-border rounded-2xl text-xs font-black text-[#0B1828] hover:bg-slate-50 transition-all">{t('units.unitModal.addLink')}</button>
                                            </div>
                                            {(form.externalLinks ?? []).length > 0 && (
                                                <ul className="mt-2 flex flex-col gap-1.5">
                                                    {(form.externalLinks ?? []).map((href) => (
                                                        <li key={href} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-sira-border bg-slate-50/50 dark:bg-foreground/5 py-1 ps-3 pe-1">
                                                            <span className="flex-1 truncate text-[11px] text-foreground/80">{href}</span>
                                                            <button type="button" onClick={() => setForm({ ...form, externalLinks: (form.externalLinks ?? []).filter((x) => x !== href) })} className="rounded-md p-1.5 text-slate-300 hover:bg-red-500/10 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>

                        <div className="p-10 border-t border-slate-50 dark:border-sira-border bg-slate-50/50 dark:bg-foreground/5 flex gap-4 flex-shrink-0">
                            {wizardStep === 2 && editingId == null && (
                                <button
                                    type="button"
                                    onClick={() => setWizardStep(1)}
                                    className="rounded-2xl border border-slate-200 bg-white px-10 py-4 text-xs font-black text-slate-600 dark:border-sira-border dark:bg-sira-bg-card dark:text-slate-300"
                                >
                                    {t('units.unitModal.back')}
                                </button>
                            )}
                            <button type="button" onClick={closeModal} className="flex-1 rounded-2xl border border-slate-200 bg-white py-4 text-xs font-black text-slate-700 dark:border-sira-border dark:bg-sira-bg-card dark:text-slate-200">
                                {t('units.unitModal.cancel')}
                            </button>
                            {(wizardStep === 2 || editingId != null) && (
                                <button type="submit" form="unit-wizard-form" disabled={saving} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl border border-[#0B1828] bg-[#0B1828] py-4 font-black text-xs leading-tight text-white shadow-lg shadow-[#0B1828]/20 disabled:opacity-50">
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {editingId != null ? t('units.unitModal.save') : t('units.unitModal.create')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body,
                )}

            <Modal
                isOpen={!!publishTarget}
                onClose={closePublish}
                title={
                    publishTarget
                        ? t('units.publishModal.title', { code: publishTarget.code })
                        : t('units.publishModal.titleFallback')
                }
                subtitle={t('units.publishModal.subtitle')}
                size="lg"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[#0B1828] shadow-sm">
                        <Share2 className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                {publishTarget && (
                    <form onSubmit={submitPublish} className="space-y-4">
                        <p className="text-xs leading-relaxed text-neutral-600 dark:text-foreground/70">
                            {t('units.publishModal.intro')}
                        </p>
                        {publishPlaces.map((place, idx) => (
                            <div
                                key={idx}
                                className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-sira-border dark:bg-foreground/[0.04]"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    {publishPlaces.length > 1 ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPublishPlaces((prev) => prev.filter((_, i) => i !== idx))
                                            }
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-300 bg-rose-50 text-rose-800 shadow-sm transition-colors hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-900/55"
                                            title={t('units.publishModal.removeRow')}
                                            aria-label={t('units.publishModal.removeRow')}
                                        >
                                            <X className="h-4 w-4 stroke-[2.5]" />
                                        </button>
                                    ) : (
                                        <span className="h-8 w-8 shrink-0" aria-hidden />
                                    )}
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sira-gold dark:text-amber-400/95">
                                        {t('units.publishModal.rowLabel', { n: idx + 1 })}
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-sira-gold dark:text-amber-400/90">
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
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sira-gold focus:ring-2 focus:ring-sira-gold/20 dark:border-sira-border dark:bg-sira-bg-card"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-sira-gold dark:text-amber-400/90">
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
                                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-sira-gold focus:ring-2 focus:ring-sira-gold/20 dark:border-sira-border dark:bg-sira-bg-card"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => setPublishPlaces((prev) => [...prev, { name: '', link: '' }])}
                            className="w-full rounded-2xl border-2 border-dashed border-sira-gold/45 bg-transparent py-2.5 text-xs font-bold text-sira-gold transition-colors hover:bg-sira-gold/5 dark:border-sira-gold/35 dark:hover:bg-sira-gold/10"
                        >
                            {t('units.publishModal.addAnother')}
                        </button>
                        <p className="mt-1 text-[10px] text-neutral-500 dark:text-sira-text-muted">
                            {t('units.publishModal.footerHint')}
                        </p>
                        <div className="modal-actions-stack">
                            <button
                                type="submit"
                                disabled={publishSaving}
                                className="modal-btn-primary flex items-center justify-center gap-2"
                            >
                                {publishSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('units.publishModal.save')}
                            </button>
                            <button type="button" onClick={closePublish} className="modal-btn-secondary">
                                {t('common.cancel')}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                isOpen={rejectModalOpen}
                onClose={() => {
                    if (rejectSaving) return;
                    setRejectModalOpen(false);
                    setRejectTarget(null);
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
                    {rejectTarget ? (
                        <p className="text-xs font-black text-slate-500 dark:text-slate-400">
                            {rejectTarget.code} {rejectTarget.projectName ? `· ${rejectTarget.projectName}` : ''}
                        </p>
                    ) : null}
                    <div>
                        <label className="modal-label">{t('units.rejectReason')}</label>
                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={4}
                            required
                            placeholder={t('units.rejectReasonPlaceholder')}
                            className="modal-textarea"
                        />
                    </div>
                    <div className="modal-actions-stack">
                        <button
                            type="button"
                            onClick={handleConfirmRejectUnit}
                            disabled={rejectSaving || !rejectReason.trim()}
                            className="modal-btn-danger"
                        >
                            {rejectSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {t('common.yes', { defaultValue: 'Yes' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setRejectModalOpen(false);
                                setRejectTarget(null);
                                setRejectReason('');
                            }}
                            disabled={rejectSaving}
                            className="modal-btn-secondary"
                        >
                            {t('common.no', { defaultValue: 'No' })}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Preview Request Modal */}
            <Modal
                isOpen={previewModalOpen}
                onClose={closePreviewModal}
                title={t('units.previewRequest.title')}
                subtitle={t('units.previewRequest.subtitle')}
                size="lg"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                        <Eye className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                <form onSubmit={submitPreviewRequest} className="space-y-4">
                    <p className="-mt-2 text-xs leading-relaxed text-sira-text-muted">
                        {t('units.previewRequest.publishedOnlyIntro')}{' '}
                        <span className="font-semibold text-foreground">{t('units.myPreviews')}</span>{' '}
                        {t('units.previewRequest.publishedOnlySuffix')}
                    </p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] font-semibold text-slate-700 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-200">
                        {previewIsOwnUnit
                            ? t('units.previewRequest.ownUnitDirectInfo')
                            : t('units.previewRequest.otherUnitNeedsApprovalInfo')}
                        <span className="mt-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {t('units.previewRequest.overlapBlockedInfo')}
                        </span>
                    </div>
                    <div>
                        <label className="modal-label">
                            {t('units.previewRequest.clientNameRequired')}
                        </label>
                        <input
                            required
                            value={previewForm.clientName}
                            onChange={(e) => setPreviewForm({ ...previewForm, clientName: e.target.value })}
                            placeholder={t('units.previewRequest.clientNamePlaceholder')}
                            className="modal-input"
                        />
                    </div>
                    <div>
                        <label className="modal-label">
                            {t('units.previewRequest.clientPhone')}
                        </label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            <Select value={previewPhoneDial} onValueChange={setPreviewPhoneDial}>
                                <SelectTrigger className="modal-field-select h-auto w-full sm:w-[148px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PREVIEW_PHONE_DIAL_OPTIONS.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <input
                                value={previewForm.clientPhone ?? ''}
                                onChange={(e) => setPreviewForm({ ...previewForm, clientPhone: e.target.value })}
                                placeholder={t('units.previewRequest.clientPhoneNationalPlaceholder')}
                                inputMode="numeric"
                                autoComplete="tel-national"
                                className="modal-input flex-1"
                            />
                        </div>
                        {previewSmsHref != null && (
                            <a
                                href={previewSmsHref}
                                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                            >
                                <MessageSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {t('units.previewRequest.openSms')}
                            </a>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="modal-label">
                                {t('units.previewRequest.dateTimeRequired')}
                            </label>
                            <input
                                required
                                type="datetime-local"
                                value={previewForm.scheduledAt}
                                onChange={(e) => setPreviewForm({ ...previewForm, scheduledAt: e.target.value })}
                                className="modal-input"
                            />
                        </div>
                        <div>
                            <label className="modal-label">
                                {t('units.previewRequest.durationMinutes')}
                            </label>
                            <input
                                type="number"
                                min={5}
                                value={previewForm.durationMin ?? 60}
                                onChange={(e) => setPreviewForm({ ...previewForm, durationMin: Number(e.target.value) || 60 })}
                                className="modal-input"
                            />
                        </div>
                    </div>
                    {previewForm.scheduledAt?.trim() && previewSlotCheck.loading && (
                        <p className="text-xs text-foreground/50 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            {t('units.previewRequest.checkingAvailability')}
                        </p>
                    )}
                    {previewSlotCheck.result?.available === true && previewForm.scheduledAt?.trim() && !previewSlotCheck.loading && (
                        <p className="text-xs text-emerald-600/95 font-medium">{t('units.previewRequest.slotAvailable')}</p>
                    )}
                    {previewSlotCheck.result?.available === false && !previewSlotCheck.loading && (
                        <p className="text-xs text-amber-200/95 bg-amber-500/12 border border-amber-500/35 rounded-lg px-3 py-2.5 leading-snug">
                            {t('units.previewRequest.slotUnavailablePrefix')}{' '}
                            <span className="font-bold">{previewSlotCheck.result.conflict.assignedToName}</span>{' '}
                            {t('units.previewRequest.slotUnavailableMiddle')} ({fmtDateTime(previewSlotCheck.result.conflict.scheduledAt)} –{' '}
                            {fmtDateTime(previewSlotCheck.result.conflict.endsAt)}).
                            {previewSlotCheck.result.conflict.clientName ? (
                                <>
                                    {' '}
                                    {t('units.previewRequest.slotUnavailableClient')}: {previewSlotCheck.result.conflict.clientName}.
                                </>
                            ) : null}
                        </p>
                    )}
                    <div>
                        <label className="modal-label">
                            {t('units.previewRequest.notes')}
                        </label>
                        <textarea
                            rows={2}
                            value={previewForm.notes ?? ''}
                            onChange={(e) => setPreviewForm({ ...previewForm, notes: e.target.value })}
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
                            {previewSaving && <Loader2 className="w-4 h-4 animate-spin" />}
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

