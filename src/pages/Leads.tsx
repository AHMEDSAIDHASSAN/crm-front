import {
    Search,
    Plus,
    Download,
    Phone,
    ChevronLeft,
    ChevronRight,
    Loader2,
    UserPlus,
    Trash2,
    Eye,
    MessageCircle,
    FileText,
    CheckCircle2,
    CalendarPlus,
    Bookmark,
    RotateCw,
    MessageSquare,
    CalendarDays,
    X as CloseIcon,
} from 'lucide-react';
import { useState, useEffect, useMemo, useRef, type ChangeEvent, type MouseEvent } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
// framer-motion removed for performance — replaced with CSS animations
import LeadModal from '../components/leads/LeadModal';
import BulkAssignModal from '../components/leads/BulkAssignModal';
import WhatsAppBroadcastModal from '../components/leads/WhatsAppBroadcastModal';
import { AddFeedbackModal } from '../components/leads/LeadDetailMiniModals';
import Modal from '../components/ui/Modal';
import { getAllLeads, deleteLead, getAllDataBatches, createLeadFeedback, bulkSendLeadsToRotation, deleteDataBatch, isLoggingOut } from '../services/api';
import { toast } from '../lib/toast';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';
import { leadStatusBadgeClass } from '../lib/siraStyles';
import { FEEDBACK_GRID_ORDER } from '../constants/leadStatus';
import { cn } from '../lib/utils';
import { getSavedLeads, toggleSavedLead } from '../lib/savedItems';
import { formatPhoneWithCountryCode, getPhoneDigits } from '../utils/phone';
import PhoneLookupButton from '../components/leads/PhoneLookupButton';
import { translateLeadStatus } from '../lib/leadStatusLabel';
import { dataBatchMarketingLabel, dataBatchLeadSourceSuffix } from '../lib/dataBatchDisplay';
import { canDeleteDataBatch, canExportLeadsDashboard, getCanonicalRoleName } from '../lib/userRole';
import { DayPicker, type DateRange, type DropdownProps } from 'react-day-picker';
import { arSA, enUS } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';

type DateRangePreset = 'all' | 'day' | 'week' | 'month' | 'year';

function toLocalYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function fromLocalYmd(value: string): Date | undefined {
    if (!value) return undefined;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    return new Date(y, m - 1, d);
}

function computeDatePresetRange(preset: Exclude<DateRangePreset, 'all'>): { from: string; to: string } {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const to = toLocalYmd(end);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (preset === 'day') {
        return { from: toLocalYmd(start), to };
    }
    if (preset === 'week') {
        start.setDate(start.getDate() - 6);
        return { from: toLocalYmd(start), to };
    }
    if (preset === 'month') {
        start.setDate(start.getDate() - 29);
        return { from: toLocalYmd(start), to };
    }
    start.setDate(start.getDate() - 364);
    return { from: toLocalYmd(start), to };
}

/** Blur middle digits in list only; lead detail shows full number. */
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

/** Values accepted by GET /leads `type` (UI may use other sentinels like `batch`). */
const API_LEAD_TYPES = new Set(['primary', 'cold_call', 'campaign', 'platform']);

/** Manual injection channels — must match backend LEAD_INBOUND_PLATFORM_VALUES. */
const LEAD_INBOUND_PLATFORM_FILTERS = [
    { value: 'ads', labelKey: 'leadInjection.platformAds' },
    { value: 'dubizzle', labelKey: 'leadInjection.platformDubizzle' },
    { value: 'bayut', labelKey: 'leadInjection.platformBayut' },
    { value: 'aqarmap', labelKey: 'leadInjection.platformAqarmap' },
    { value: 'property_finder_egypt', labelKey: 'leadInjection.platformPropertyFinderEgypt' },
    { value: 'cold_call', labelKey: 'leadInjection.platformColdCall' },
    { value: 'resale', labelKey: 'leadInjection.platformResale' },
] as const;
const MIN_SCROLL_LOADING_MS = 350;

function inboundPlatformLabelKey(code: string | undefined | null): string | undefined {
    if (!code) return undefined;
    return LEAD_INBOUND_PLATFORM_FILTERS.find((p) => p.value === code)?.labelKey;
}

function DayPickerShadcnDropdown(props: DropdownProps) {
    const { value, onChange, options } = props;
    const current = String(value ?? '');
    const currentLabel = options?.find((opt) => String(opt.value) === current)?.label;

    return (
        <Select
            value={current}
            onValueChange={(nextValue) => {
                onChange?.({
                    target: { value: nextValue },
                } as ChangeEvent<HTMLSelectElement>);
            }}
        >
            <SelectTrigger className="h-8 min-w-[88px] rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-[#0B1828] dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground">
                <SelectValue>{currentLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent
                side="bottom"
                align="start"
                sideOffset={6}
                avoidCollisions={false}
                className="leads-calendar-select-content max-h-64"
            >
                {(options ?? []).map((opt) => (
                    <SelectItem key={String(opt.value)} value={String(opt.value)} disabled={Boolean(opt.disabled)}>
                        {opt.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export default function Leads() {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language?.toLowerCase().startsWith('ar');
    const navigate = useNavigate();
    const location = useLocation();
    const restoredState = (location.state as any)?.leadsState as
        | {
            page?: number;
            search?: string;
            searchInput?: string;
            modeFilter?: string;
            typeFilter?: string;
            statusFilter?: string;
            dateFrom?: string;
            dateTo?: string;
            dateRangePreset?: DateRangePreset;
            listView?: 'all' | 'rotation';
            assigneePresenceFilter?: 'assigned' | 'unassigned' | '';
            dataBatchIdFilter?: string;
            /** @deprecated use dataBatchIdFilter */
            campaignIdFilter?: string;
            platformFilter?: string;
            batchKindFilter?: 'ads' | 'resale' | '';
            importSourceFilter?: 'manual' | 'batches' | '';
            scrollY?: number;
        }
        | undefined;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const observerTarget = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const scrollYRef = useRef<number>(0);
    const [currentPage, setCurrentPage] = useState(restoredState?.page && restoredState.page > 0 ? restoredState.page : 1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalLeads, setTotalLeads] = useState(0);
    const [limit] = useState(20);
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
    const [selectionTargetCount, setSelectionTargetCount] = useState('');
    const [selectionByCountLoading, setSelectionByCountLoading] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [isWhatsAppBroadcastOpen, setIsWhatsAppBroadcastOpen] = useState(false);
    const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [leadToDelete, setLeadToDelete] = useState<any>(null);
    const [deleting, setDeleting] = useState(false);
    const [rotatingLeadId, setRotatingLeadId] = useState<number | null>(null);
    const [rotationConfirmLeadId, setRotationConfirmLeadId] = useState<number | null>(null);
    const [batchToDelete, setBatchToDelete] = useState<any | null>(null);
    const currentUser = useSelector((state: any) => state.user.user);
    const roleName = getCanonicalRoleName(currentUser);
    const isSuperAdmin = roleName === 'super_admin';
    const isSales = roleName === 'sales';
    const isOperationManager = roleName === 'operation_manager';
    const canViewPhone = isSales || isSuperAdmin || isOperationManager;
    const canExportLeads = canExportLeadsDashboard(currentUser);
    const canDeleteBatches = canDeleteDataBatch(currentUser);
    const canManualAddLead = canExportLeadsDashboard(currentUser);
    const canSendLeadToRotation = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'].includes(
        roleName || '',
    );

    const [modeFilter, setModeFilter] = useState(restoredState?.modeFilter || '');
    const [typeFilter, setTypeFilter] = useState(restoredState?.typeFilter || '');
    const [platformFilter, setPlatformFilter] = useState(restoredState?.platformFilter || '');
    const [statusFilter, setStatusFilter] = useState(restoredState?.statusFilter || '');
    const [dateFrom, setDateFrom] = useState(restoredState?.dateFrom || '');
    const [dateTo, setDateTo] = useState(restoredState?.dateTo || '');
    const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>(() => {
        const p = restoredState?.dateRangePreset;
        if (p === 'day' || p === 'week' || p === 'month' || p === 'year' || p === 'all') return p;
        return 'all';
    });
    const [searchInput, setSearchInput] = useState(restoredState?.searchInput || '');
    const [search, setSearch] = useState(restoredState?.search || '');
    const [listView, setListView] = useState<'all' | 'rotation'>(restoredState?.listView || 'all');
    /** Default: unassigned pool. '' = any owner (managers / TL only). */
    const [assigneePresenceFilter, setAssigneePresenceFilter] = useState<'assigned' | 'unassigned' | ''>(
        restoredState?.assigneePresenceFilter ?? 'unassigned',
    );
    const [dataBatches, setDataBatches] = useState<any[]>([]);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportMode, setExportMode] = useState<'all' | 'selected'>('all');
    const [exporting, setExporting] = useState(false);
    const [noteModalOpen, setNoteModalOpen] = useState(false);
    const [noteLead, setNoteLead] = useState<any>(null);
    const [noteText, setNoteText] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    /** Sales-only: quick status + feedback from list (same modal as lead detail). */
    const [salesFeedbackLead, setSalesFeedbackLead] = useState<any | null>(null);
    /** Filter leads by import data batch (GET /leads `dataBatchId`). */
    const [dataBatchIdFilter, setDataBatchIdFilter] = useState(restoredState?.dataBatchIdFilter ?? '');
    /** Filter leads by marketing campaign id (GET /leads `campaignId`). */
    const [campaignIdFilter, setCampaignIdFilter] = useState(restoredState?.campaignIdFilter ?? '');
    const [batchKindFilter, setBatchKindFilter] = useState<'ads' | 'resale' | ''>(restoredState?.batchKindFilter ?? '');
    const [importSourceFilter, setImportSourceFilter] = useState<'manual' | 'batches' | ''>(
        restoredState?.importSourceFilter ?? '',
    );
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const datePickerRef = useRef<HTMLDivElement>(null);

    const leadDetailsNavState = useMemo(
        () => ({
            leadsState: {
                page: currentPage,
                search,
                searchInput,
                modeFilter,
                typeFilter,
                statusFilter,
                dateFrom,
                dateTo,
                dateRangePreset,
                listView,
                assigneePresenceFilter,
                dataBatchIdFilter,
                campaignIdFilter,
                platformFilter,
                batchKindFilter,
                importSourceFilter,
            },
        }),
        [
            currentPage,
            search,
            searchInput,
            modeFilter,
            typeFilter,
            platformFilter,
            statusFilter,
            dateFrom,
            dateTo,
            dateRangePreset,
            listView,
            assigneePresenceFilter,
            dataBatchIdFilter,
            campaignIdFilter,
            batchKindFilter,
            importSourceFilter,
        ],
    );

    const getScrollContainer = (): HTMLElement =>
        (document.querySelector('main') as HTMLElement) ?? document.documentElement;

    const navigateToLead = (leadId: string | number) => {
        navigate(`/leads/${leadId}`, {
            state: {
                leadsState: {
                    ...leadDetailsNavState.leadsState,
                    scrollY: getScrollContainer().scrollTop,
                },
            },
        });
    };

    const applyDatePreset = (preset: DateRangePreset) => {
        setDateRangePreset(preset);
        setCurrentPage(1);
        if (preset === 'all') {
            setDateFrom('');
            setDateTo('');
            return;
        }
        const range = computeDatePresetRange(preset);
        setDateFrom(range.from);
        setDateTo(range.to);
    };

    const selectedDateRange = useMemo<DateRange | undefined>(() => {
        const from = fromLocalYmd(dateFrom);
        const to = fromLocalYmd(dateTo);
        if (!from && !to) return undefined;
        return { from, to };
    }, [dateFrom, dateTo]);

    useEffect(() => {
        if (!datePickerOpen) return;
        const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            // Month/year select renders in a portal, so clicks there
            // should not close the calendar popover.
            if (target.closest('.leads-calendar-select-content')) return;
            if (datePickerRef.current && !datePickerRef.current.contains(target)) {
                setDatePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown as EventListener);
        return () => document.removeEventListener('mousedown', handlePointerDown as EventListener);
    }, [datePickerOpen]);

    // const [demoRoleTab] = useState<'team_leader' | 'sales' | 'operation' | 'admin'>('admin');
    // const [showRoleInfo, setShowRoleInfo] = useState(false);
    const [savedLeadIds, setSavedLeadIds] = useState<Set<number>>(
        () => new Set(getSavedLeads().map((x) => Number(x.id))),
    );

    const refreshSavedLeadIds = () => {
        setSavedLeadIds(new Set(getSavedLeads().map((x) => Number(x.id))));
    };

    const handleToggleSaveLead = (lead: any) => {
        if (!isSales) {
            toast.error(t('saved.salesOnlyHint', { defaultValue: 'Saved items are available for sales only' }));
            return;
        }
        const saved = toggleSavedLead({
            id: Number(lead.id),
            name: `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim(),
            phone: lead.phone || undefined,
        });
        refreshSavedLeadIds();
        toast.success(
            saved
                ? t('saved.savedLeadSuccess', { defaultValue: 'Lead saved' })
                : t('saved.unsavedLeadSuccess', { defaultValue: 'Lead removed from saved' }),
        );
    };

    useEffect(() => {
        if (!isSales) return;
        if (listView === 'rotation') {
            setListView('all');
            setCurrentPage(1);
        }
    }, [isSales, listView]);

    useEffect(() => {
        if (!isSales) return;
        if (modeFilter || dataBatchIdFilter || campaignIdFilter.trim()) {
            setModeFilter('');
            setDataBatchIdFilter('');
            setCampaignIdFilter('');
        }
    }, [isSales, modeFilter, dataBatchIdFilter, campaignIdFilter]);

    /* const roleInfo = useMemo(() => {
        const info: Record<string, { title: string; color: string; permissions: string[] }> = {
            'admin': {
                title: '🔐 الإدارة - صلاحيات كاملة',
                color: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/10 dark:text-blue-400 dark:border-blue-800',
                permissions: ['رؤية جميع العملاء', 'تحويل العملاء', 'حقن بيانات جديدة', 'رؤية التقارير الكاملة']
            },
            'operation': {
                title: '⚙️ المشرف التشغيلي',
                color: 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/10 dark:text-purple-400 dark:border-purple-800',
                permissions: ['رؤية جميع العملاء', 'تحويل العملاء', 'إدارة الفريق', 'حقن بيانات جديدة']
            },
            'team_leader': {
                title: '👤 قائد الفريق',
                color: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/10 dark:text-amber-400 dark:border-amber-800',
                permissions: ['رؤية عملاء الفريق فقط', 'الإشراف المحدود', 'تقارير الأداء']
            },
            'sales': {
                title: '💼 موظف المبيعات',
                color: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/10 dark:text-emerald-400 dark:border-emerald-800',
                permissions: ['رؤية عملائك فقط', 'تحديث الحالة', 'إضافة ملاحظات', 'رؤية عمولاتك']
            }
        };
        return info[demoRoleTab] || info.admin;
    }, [demoRoleTab]); */

    const selectedDataBatch = useMemo(
        () => dataBatches.find((b) => String(b.id) === dataBatchIdFilter),
        [dataBatches, dataBatchIdFilter],
    );
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const activeFilterLabels = useMemo(() => {
        const labels: string[] = [];
        if (search?.trim()) labels.push(`${t('leads.search')}: "${search.trim()}"`);
        if (!isSales && modeFilter) labels.push(`${t('leads.flow')}: ${modeFilter}`);
        if (!isSales && typeFilter) {
            const typeLabel =
                typeFilter === 'platform'
                    ? t('leads.platform')
                    : typeFilter === 'cold_call'
                        ? t('leads.coldCall')
                        : typeFilter === 'campaign'
                            ? t('leads.campaign')
                            : typeFilter;
            labels.push(`${t('leads.leadType')}: ${typeLabel}`);
        }
        if (platformFilter) {
            const pk = inboundPlatformLabelKey(platformFilter);
            labels.push(`${t('leads.platformChannel')}: ${pk ? t(pk) : platformFilter}`);
        }
        if (statusFilter) labels.push(`${t('leads.status')}: ${translateLeadStatus(t, statusFilter)}`);
        if (dateRangePreset !== 'all') {
            labels.push(t(`leads.datePreset.${dateRangePreset}`));
        } else if (dateFrom || dateTo) {
            if (dateFrom) labels.push(`${t('leads.from')}: ${dateFrom}`);
            if (dateTo) labels.push(`${t('leads.to')}: ${dateTo}`);
        }
        if (dataBatchIdFilter && selectedDataBatch) {
            const name = selectedDataBatch.batchName ?? `#${dataBatchIdFilter}`;
            const kind = dataBatchMarketingLabel(selectedDataBatch.dataSource, t);
            labels.push(`${t('leads.dataBatch')}: ${name} — ${kind}`);
        }
        if (batchKindFilter) {
            labels.push(`${t('leads.leadType')}: ${batchKindFilter === 'ads' ? t('leads.batchKindAdsProject') : t('leads.batchKindResale')}`);
        }
        if (importSourceFilter) {
            labels.push(`${t('leads.dataSource')}: ${importSourceFilter === 'manual' ? t('leads.manual') : t('leads.batches')}`);
        }
        if (campaignIdFilter.trim()) labels.push(`${t('leads.campaign')}: #${campaignIdFilter.trim()}`);
        if (listView === 'rotation') labels.push(`${t('leads.pool')}: ${t('leads.rotation')}`);
        if (!isSales && assigneePresenceFilter) {
            const ownerLabel =
                assigneePresenceFilter === 'assigned'
                    ? t('leads.hasOwner')
                    : assigneePresenceFilter === 'unassigned'
                        ? t('leads.noOwner')
                        : t('leads.anyOwner');
            labels.push(`${t('leads.owner')}: ${ownerLabel}`);
        }
        return labels;
    }, [
        search,
        modeFilter,
        typeFilter,
        platformFilter,
        statusFilter,
        dateFrom,
        dateTo,
        dateRangePreset,
        dataBatchIdFilter,
        campaignIdFilter,
        selectedDataBatch,
        listView,
        isSales,
        assigneePresenceFilter,
        importSourceFilter,
        t,
    ]);

    useEffect(() => {
        let cancelled = false;
        getAllDataBatches()
            .then((data) => {
                const list = Array.isArray(data) ? data : data?.data ?? [];
                if (!cancelled) setDataBatches(Array.isArray(list) ? list : []);
            })
            .catch(() => {
                if (!cancelled) setDataBatches([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (typeFilter === 'manual' || typeFilter === 'batch') {
            setTypeFilter('');
        }
    }, [typeFilter]);

    useEffect(() => {
        if (typeFilter !== 'platform' && typeFilter !== 'cold_call' && typeFilter !== 'campaign') {
            setImportSourceFilter('');
        }
    }, [typeFilter]);

    useEffect(() => {
        fetchLeads();
    }, [currentPage, modeFilter, typeFilter, platformFilter, statusFilter, dateFrom, dateTo, search, listView, assigneePresenceFilter, dataBatchIdFilter, campaignIdFilter, batchKindFilter, importSourceFilter]);

    // Restore scroll position when returning from lead detail page
    const scrollRestored = useRef(false);
    useEffect(() => {
        const savedScrollY = restoredState?.scrollY;
        if (!savedScrollY || scrollRestored.current || loading || leads.length === 0) return;
        scrollRestored.current = true;
        const restore = () => {
            const el = (document.querySelector('main') as HTMLElement) ?? document.documentElement;
            el.scrollTop = savedScrollY;
        };
        // Double rAF: ensures React has committed + browser has painted
        requestAnimationFrame(() => requestAnimationFrame(restore));
        // Fallback for slow renders
        const t = setTimeout(restore, 150);
        return () => clearTimeout(t);
    }, [leads, loading]);

    useEffect(() => {
        let cancelled = false;
        // Debounce status counts — they're expensive (12 parallel requests).
        // Wait 600ms after last filter change before fetching.
        const timer = setTimeout(async () => {
            if (cancelled) return;
            try {
                const params = buildLeadsQueryParams();
                delete (params as any).status;
                // Fire all status-count requests + all-count in parallel
                const [allRes, ...rows] = await Promise.all([
                    getAllLeads(1, 1, params),
                    ...FEEDBACK_GRID_ORDER.map((value) =>
                        getAllLeads(1, 1, { ...params, status: value })
                            .then((res) => [value, Number(res?.meta?.total ?? 0)] as const)
                            .catch(() => [value, 0] as const)
                    ),
                ]);
                if (cancelled) return;
                const next: Record<string, number> = {};
                for (const [k, v] of rows as [string, number][]) next[k] = v;
                next.__all__ = Number((allRes as any)?.meta?.total ?? 0);
                setStatusCounts(next);
            } catch {
                if (!cancelled) setStatusCounts({});
            }
        }, 600);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [modeFilter, typeFilter, platformFilter, dateFrom, dateTo, search, listView, assigneePresenceFilter, dataBatchIdFilter, campaignIdFilter, batchKindFilter, importSourceFilter]);

    const statusQueryFallbacks: Record<string, string[]> = {
        switched_off: ['switched_off', 'switch_off', 'switchedoff'],
        meeting_cancelled: ['meeting_cancelled', 'meeting_canceled'],
    };

    const buildLeadsQueryParams = () => ({
        search: search || undefined,
        assignmentMode: modeFilter || undefined,
        ...(API_LEAD_TYPES.has(typeFilter) ? { type: typeFilter } : {}),
        ...(listView !== 'rotation' && statusFilter ? { status: statusFilter } : {}),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        ...(dataBatchIdFilter ? { dataBatchId: dataBatchIdFilter } : {}),
        ...(campaignIdFilter.trim() ? { campaignId: campaignIdFilter.trim() } : {}),
        ...(platformFilter ? { inboundPlatform: platformFilter } : {}),
        ...(batchKindFilter ? { batchKind: batchKindFilter } : {}),
        ...(importSourceFilter ? { importSource: importSourceFilter } : {}),
        ...(listView === 'rotation'
            ? { status: 'rotation' }
            : { excludeRotation: true }),
        ...(!isSales && assigneePresenceFilter !== ''
            ? { assigneePresence: assigneePresenceFilter }
            : {}),
    });

    const fetchLeads = async () => {
        const startedAt = Date.now();
        const isScrollLoad = currentPage !== 1;
        try {
            if (currentPage === 1) setLoading(true);
            else setLoadingMore(true);
            const baseParams = buildLeadsQueryParams();
            const statusAttempts =
                listView !== 'rotation' && statusFilter
                    ? (statusQueryFallbacks[statusFilter] || [statusFilter])
                    : [undefined];

            let loaded = false;
            let lastError: any = null;

            for (let i = 0; i < statusAttempts.length; i += 1) {
                const attemptStatus = statusAttempts[i];
                const params = {
                    ...baseParams,
                    ...(attemptStatus ? { status: attemptStatus } : {}),
                };

                try {
                    const response = await getAllLeads(currentPage, limit, params);
                    setLeads(prev => {
                        if (currentPage === 1 || prev.length === 0) {
                            return response.data;
                        }
                        const existingIds = new Set(prev.map(l => l.id));
                        const newLeads = response.data.filter((l: any) => !existingIds.has(l.id));
                        return [...prev, ...newLeads];
                    });
                    setTotalPages(response.meta.totalPages);
                    setTotalLeads(response.meta.total);
                    loaded = true;
                    break;
                } catch (error: any) {
                    lastError = error;
                    const isLastAttempt = i === statusAttempts.length - 1;
                    const message = String(error?.response?.data?.message || '').toLowerCase();
                    const statusLooksInvalid =
                        error?.response?.status === 400 &&
                        (message.includes('status') || message.includes('enum'));
                    if (isLastAttempt || !statusLooksInvalid) {
                        break;
                    }
                }
            }

            if (!loaded) {
                throw lastError || new Error('Failed to fetch leads');
            }
        } catch (error: any) {
            if (!isLoggingOut() && error?.response?.status !== 401 && error?.message !== 'SESSION_EXPIRED') {
                toast.error(t('leads.failedFetch'));
            }
        } finally {
            if (isScrollLoad) {
                const elapsed = Date.now() - startedAt;
                if (elapsed < MIN_SCROLL_LOADING_MS) {
                    await new Promise((resolve) => setTimeout(resolve, MIN_SCROLL_LOADING_MS - elapsed));
                }
            }
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const toggleLeadSelection = (id: number) => {
        setSelectedLeadIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAllLeads = async () => {
        const targetPage = Math.max(1, Number(currentPage || 1));
        const expectedCount = targetPage * limit;
        const params = buildLeadsQueryParams();

        // Fetch first N deterministically (single request) to avoid
        // page-merge drift/duplicates causing short selection counts.
        const response = await getAllLeads(1, expectedCount, params);
        const loaded = Array.isArray(response?.data) ? response.data : [];
        const loadedIds = loaded.map((l: any) => Number(l.id));

        // Keep UI rows in sync with the fetched deterministic block.
        setLeads(loaded);

        const allLoadedSelected =
            loadedIds.length > 0 && loadedIds.every((id: number) => selectedLeadIds.includes(id));

        if (allLoadedSelected) {
            setSelectedLeadIds((prev) => prev.filter((id) => !loadedIds.includes(id)));
        } else {
            setSelectedLeadIds(Array.from(new Set(loadedIds)));
        }
    };

    const applySelectionTargetCount = async () => {
        const cleaned = String(selectionTargetCount || '').replace(/[^\d]/g, '');
        const raw = Number(cleaned);
        if (!Number.isFinite(raw) || raw <= 0) {
            toast.error(t('leads.invalidSelectionCount', { defaultValue: 'Enter a valid selection count' }));
            return;
        }
        if (leads.length === 0) {
            toast.info(t('leads.noLeadsToSelect', { defaultValue: 'No leads loaded to select' }));
            return;
        }

        setSelectionByCountLoading(true);
        try {
            const target = Math.max(1, Math.floor(raw));
            const params = buildLeadsQueryParams();

            const mergedById = new Map<number, any>();
            for (const item of leads) mergedById.set(Number(item.id), item);

            let nextPage = Math.max(1, Number(currentPage) + 1);
            let maxPages = Math.max(1, Number(totalPages || 1));
            let latestTotal = Number(totalLeads || 0);
            let highestLoadedPage = Math.max(1, Number(currentPage));

            while (mergedById.size < target && nextPage <= maxPages) {
                const response = await getAllLeads(nextPage, limit, params);
                const items = Array.isArray(response?.data) ? response.data : [];
                for (const item of items) {
                    mergedById.set(Number(item.id), item);
                }
                highestLoadedPage = Math.max(highestLoadedPage, nextPage);
                maxPages = Math.max(maxPages, Number(response?.meta?.totalPages || maxPages));
                latestTotal = Number(response?.meta?.total ?? latestTotal);
                nextPage += 1;
                if (items.length === 0) break;
            }

            const mergedList = Array.from(mergedById.values());
            if (mergedList.length !== leads.length) {
                setLeads(mergedList);
            }
            if (latestTotal > 0) {
                setTotalLeads(latestTotal);
            }
            // Keep infinite-scroll cursor aligned with preloaded pages
            // so next scroll continues from the correct page.
            if (highestLoadedPage > currentPage) {
                setCurrentPage(highestLoadedPage);
            }

            const finalTarget = Math.min(target, mergedList.length);
            const targetIds = mergedList.slice(0, finalTarget).map((l: any) => Number(l.id));
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
        } finally {
            setSelectionByCountLoading(false);
        }
    };

    useEffect(() => {
        const cleaned = String(selectionTargetCount || '').replace(/[^\d]/g, '');
        if (!cleaned) return;
        if (selectionByCountLoading) return;
        const timer = window.setTimeout(() => {
            void applySelectionTargetCount();
        }, 450);
        return () => window.clearTimeout(timer);
    }, [selectionTargetCount]);

    const handleDeleteClick = (lead: any) => setLeadToDelete(lead);

    const handleSendLeadToRotation = async (lead: any, e?: MouseEvent) => {
        e?.stopPropagation();
        const id = Number(lead?.id);
        if (!canSendLeadToRotation || !Number.isFinite(id)) return;
        if (lead?.status === 'rotation') {
            toast.info(t('leads.rotationRowAlreadyInPool', { defaultValue: 'Lead is already in the rotation pool.' }));
            return;
        }
        setRotatingLeadId(id);
        try {
            await bulkSendLeadsToRotation({ leadIds: [id] });
            toast.success(t('leads.rotationRowSuccess'));
            await fetchLeads();
        } catch (error: any) {
            const payload = error?.response?.data;
            if (payload?.code === 'ROTATION_CONFIRM_REQUIRED') {
                setRotationConfirmLeadId(id);
            } else if (error?.response?.status === 403) {
                toast.error(t('leads.rotationRowDenied'));
            } else {
                toast.error(payload?.message || t('leads.rotationRowFail'));
            }
        } finally {
            setRotatingLeadId(null);
        }
    };

    const handleConfirmForceRotation = async () => {
        const id = rotationConfirmLeadId;
        if (!id) return;
        setRotationConfirmLeadId(null);
        setRotatingLeadId(id);
        try {
            await bulkSendLeadsToRotation({ leadIds: [id], force: true });
            toast.success(t('leads.rotationRowSuccess'));
            await fetchLeads();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || t('leads.rotationRowFail'));
        } finally {
            setRotatingLeadId(null);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!leadToDelete) return;
        try {
            setDeleting(true);
            await deleteLead(leadToDelete.id);
            toast.success(t('leads.leadDeleted'));
            setLeadToDelete(null);
            fetchLeads();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('leads.failedDelete'));
        } finally {
            setDeleting(false);
        }
    };

    const handleBulkDeleteConfirm = async () => {
        if (selectedLeadIds.length === 0) return;
        try {
            setBulkDeleting(true);
            const results = await Promise.allSettled(selectedLeadIds.map((id) => deleteLead(id)));
            const deleted = results.filter((r) => r.status === 'fulfilled').length;
            const failed = results.length - deleted;
            if (deleted > 0 && failed === 0) {
                toast.success(
                    t('leads.bulkDeleteSuccess', {
                        count: deleted,
                        defaultValue: `${deleted} leads deleted`,
                    }),
                );
            } else if (deleted > 0 && failed > 0) {
                toast.info(
                    t('leads.bulkDeletePartial', {
                        ok: deleted,
                        fail: failed,
                        defaultValue: `${deleted} deleted, ${failed} failed`,
                    }),
                );
            } else {
                toast.error(t('leads.failedDelete'));
            }
            setBulkDeleteConfirmOpen(false);
            setSelectedLeadIds([]);
            await fetchLeads();
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleDeleteBatch = async (batch: any, e?: MouseEvent) => {
        e?.stopPropagation();
        if (!canDeleteBatches) return;
        const batchId = Number(batch?.id);
        if (!Number.isFinite(batchId)) return;
        setBatchToDelete(batch);
    };

    const handleDeleteBatchConfirm = async () => {
        if (!batchToDelete) return;
        const batchId = Number(batchToDelete?.id);
        if (!Number.isFinite(batchId)) {
            setBatchToDelete(null);
            return;
        }
        const batchName = String(batchToDelete?.batchName || `#${batchId}`);
        try {
            await deleteDataBatch(batchId);
            toast.success(
                t('campaignsPage.toastBatchDeleted', {
                    defaultValue: `Batch "${batchName}" deleted.`,
                }),
            );
            if (dataBatchIdFilter === String(batchId)) {
                setDataBatchIdFilter('');
            }
            const refreshed = await getAllDataBatches();
            const list = Array.isArray(refreshed) ? refreshed : refreshed?.data ?? [];
            setDataBatches(Array.isArray(list) ? list : []);
            await fetchLeads();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('campaignsPage.toastDeleteBatchFailed'));
        } finally {
            setBatchToDelete(null);
        }
    };

    const mapLeadToExportRow = (lead: any) => ({
        id: lead.id != null ? String(lead.id) : '',
        firstName: lead.firstName ?? '',
        lastName: lead.lastName ?? '',
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        status: lead.status ?? '',
        type: lead.type ?? '',
        inboundPlatform: lead.inboundPlatform ?? '',
        priority: lead.priority ?? '',
        assignmentMode: lead.assignmentMode ?? '',
        owner: lead.assignedUser
            ? `${lead.assignedUser.firstName ?? ''} ${lead.assignedUser.lastName ?? ''}`.trim()
            : '',
        campaign: lead.campaign?.name ?? '',
        team: lead.team?.name ?? '',
        createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
    });

    const downloadLeadsAsExcel = (rows: any[], suffix: string) => {
        const sheet = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, sheet, 'Leads');
        const dateTag = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `leads-${suffix}-${dateTag}.xlsx`);
    };

    const handleExportLeads = async () => {
        if (!canExportLeads) return;
        setExporting(true);
        try {
            let exportRows: any[] = [];
            if (exportMode === 'selected') {
                if (selectedLeadIds.length === 0) {
                    toast.error(t('leads.noSelectedToExport'));
                    return;
                }
                let page = 1;
                const pageLimit = 200;
                const collected: any[] = [];
                while (true) {
                    const res = await getAllLeads(page, pageLimit, buildLeadsQueryParams());
                    const items = Array.isArray(res?.data) ? res.data : [];
                    if (items.length === 0) break;
                    collected.push(...items.filter((l: any) => selectedLeadIds.includes(Number(l.id))));
                    if (page >= Number(res?.meta?.totalPages || 1)) break;
                    page += 1;
                }
                exportRows = collected;
            } else {
                const params = buildLeadsQueryParams();
                let page = 1;
                const pageLimit = 500;
                const collected: any[] = [];
                while (true) {
                    const res = await getAllLeads(page, pageLimit, params);
                    const items = Array.isArray(res?.data) ? res.data : [];
                    if (items.length === 0) break;
                    collected.push(...items);
                    if (page >= Number(res?.meta?.totalPages || 1)) break;
                    page += 1;
                }
                exportRows = collected;
            }

            if (exportRows.length === 0) {
                toast.error(t('leads.noLeadsToExport'));
                return;
            }

            downloadLeadsAsExcel(
                exportRows.map(mapLeadToExportRow),
                exportMode,
            );
            setExportModalOpen(false);
            toast.success(t('leads.exportedCount', { count: exportRows.length }));
        } catch {
            toast.error(t('leads.failedExport'));
        } finally {
            setExporting(false);
        }
    };

    /** True when lead was transferred to a different sales person recently (within 48 h)
     *  AND kept its non-new status — signals the new owner it arrived from someone else. */
    const isRecentlyTransferred = (lead: any): boolean => {
        if (!lead?.assignedAt) return false;
        const hoursSince = (Date.now() - new Date(lead.assignedAt).getTime()) / 3_600_000;
        if (hoursSince > 48) return false;
        // Exclude leads that were reset to new (fresh assignments from pool)
        const st = String(lead.status || '').toLowerCase();
        return st !== 'new_lead' && st !== 'rotation' && st !== 'assigned';
    };

    const leadTableSourceLine = (lead: any) => {
        const inboundKey = inboundPlatformLabelKey(lead.inboundPlatform);
        const typePart =
            lead.type === 'cold_call'
                ? t('leads.coldCall')
                : lead.type === 'campaign'
                    ? `${t('leads.campaign')}${lead.campaign?.name ? ` · ${lead.campaign.name}` : ''}`
                    : lead.type === 'platform'
                        ? t('leads.platform')
                        : lead.type?.replace('_', ' ') ?? '';
        const inboundPart = inboundKey ? t(inboundKey) : '';
        const batchTag = dataBatchLeadSourceSuffix(lead.dataBatch?.dataSource, t);
        return [typePart, inboundPart, batchTag].filter(Boolean).join(' · ');
    };

    /** Tiny secondary line under source (no extra table column). */
    const leadInlineBatchName = (lead: any): string | null => {
        if (!(lead.dataBatch?.batchName || lead.dataBatch?.id != null)) return null;
        const name = lead.dataBatch?.batchName || (lead.dataBatch?.id != null ? `#${lead.dataBatch.id}` : '');
        return name || null;
    };
    /** Sales: extra actions (status, note, saved, meeting) only after feedback or a meeting — not from call/WhatsApp alone. */
    const hasSalesProcedureUnlocked = (lead: any) =>
        Number(lead?._count?.feedbacks || 0) > 0 || Number(lead?._count?.meetings || 0) > 0;

    const handleAddLeadNote = async (lead: any) => {
        if (!lead?.id) return;
        setNoteLead(lead);
        setNoteText('');
        setNoteModalOpen(true);
    };

    const handleSaveLeadNote = async () => {
        if (!noteLead?.id || currentUser?.id == null) return;
        if (!noteText.trim()) {
            toast.error(t('leads.notePrompt', { defaultValue: 'Write your note about this lead:' }));
            return;
        }
        try {
            setNoteSaving(true);
            await createLeadFeedback({
                leadId: Number(noteLead.id),
                userId: Number(currentUser.id),
                feedbackType: String(noteLead.status || 'new_lead'),
                description: noteText.trim(),
            });
            toast.success(t('leads.noteSaved', { defaultValue: 'Note saved successfully' }));
            setNoteModalOpen(false);
            setNoteLead(null);
            setNoteText('');
            await fetchLeads();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('leads.noteSaveFailed', { defaultValue: 'Failed to save note' }));
        } finally {
            setNoteSaving(false);
        }
    };

    const scrollTimeoutRef = useRef<any>(null);

    useEffect(() => {
        const root = tableContainerRef.current;
        if (!root) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const isAnyModalOpen =
                    isBulkModalOpen ||
                    noteModalOpen ||
                    exportModalOpen ||
                    isModalOpen ||
                    !!leadToDelete ||
                    !!salesFeedbackLead;

                if (entries[0].isIntersecting && !loading && !loadingMore && currentPage < totalPages && !isAnyModalOpen) {
                    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

                    scrollTimeoutRef.current = setTimeout(() => {
                        setCurrentPage((p) => p + 1);
                    }, 400);
                } else {
                    if (scrollTimeoutRef.current) {
                        clearTimeout(scrollTimeoutRef.current);
                        scrollTimeoutRef.current = null;
                    }
                }
            },
            {
                root: root,
                threshold: 0.1,
                rootMargin: '0px 0px 200px 0px' // Start loading slightly before reaching the very bottom
            }
        );
        const el = observerTarget.current;
        if (el) observer.observe(el);
        return () => {
            if (el) observer.unobserve(el);
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        };
    }, [
        loading,
        loadingMore,
        currentPage,
        totalPages,
        isBulkModalOpen,
        noteModalOpen,
        exportModalOpen,
        isModalOpen,
        leadToDelete,
        salesFeedbackLead,
    ]);

    return (
        <div className="min-h-full bg-slate-50/50 dark:bg-sira-bg-page" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="w-full space-y-6 p-3 pb-10 md:space-y-8 md:p-8">
                {/* isSuperAdmin && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4 dark:bg-sira-bg-card dark:border-sira-border">
                            <button
                                type="button"
                                onClick={() => setShowRoleInfo(!showRoleInfo)}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[12px] flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/25 uppercase tracking-widest"
                            >
                                <Shield size={14} />
                                {t('leads.permissionsInfo')}
                            </button>
                            <div className="flex flex-col md:flex-row items-center gap-4">
                                <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">
                                    {t('leads.roleTrialLabel')}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(
                                        [
                                            ['team_leader', 'teamLeader'],
                                            ['sales', 'sales'],
                                            ['operation', 'operation'],
                                            ['admin', 'admin'],
                                        ] as const
                                    ).map(([key, i18nKey]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setDemoRoleTab(key)}
                                            className={`px-4 py-2 rounded-lg text-[12px] font-black uppercase tracking-widest transition-all ${demoRoleTab === key
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-foreground/5 dark:text-foreground'
                                                }`}
                                        >
                                            {t(`leads.roleTrial.${i18nKey}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {showRoleInfo && (
                            <div className={`border-2 rounded-[3rem] p-8 ${roleInfo.color} overflow-hidden animate-in fade-in duration-200`}>
                                <h3 className="text-lg font-black mb-4 flex items-center gap-2">{roleInfo.title}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {roleInfo.permissions.map((perm, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <CheckCircle2 size={16} className="flex-shrink-0" />
                                            <span className="text-sm font-bold">{perm}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) */}

                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[3rem] border border-slate-100 shadow-sm gap-6 dark:bg-sira-bg-card dark:border-sira-border md:p-8">
                    <div className="flex flex-wrap items-center gap-3 md:justify-start order-2 md:order-1">
                        {canManualAddLead ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedLead(null);
                                    setIsModalOpen(true);
                                }}
                                className="bg-[#0B1828] text-white px-8 py-3.5 rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-xl flex items-center gap-2 active:scale-95 transition-all"
                            >
                                <Plus className="h-4 w-4 shrink-0" strokeWidth={3} /> {t('leads.injectNewData')}
                            </button>
                        ) : null}
                        {canExportLeads ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setExportMode('all');
                                    setExportModalOpen(true);
                                }}
                                className="px-8 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-[12px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm dark:bg-foreground/5 dark:border-sira-border dark:text-slate-300"
                            >
                                <Download className="h-4 w-4 shrink-0" /> {t('leads.exportLeads')}
                            </button>
                        ) : null}
                    </div>
                    <div
                        className={cn(
                            "min-w-0 text-center order-1 md:order-2 w-full",
                            isRtl ? "md:text-right md:ms-auto md:items-end" : "md:text-left",
                        )}
                    >
                        <h1 className="text-4xl font-black text-[#0B1828] dark:text-white uppercase tracking-tight">
                            {t('leads.pageHeroTitle')}
                        </h1>
                        <p
                            dir={isRtl ? 'rtl' : 'ltr'}
                            className={cn(
                                "mt-1 flex items-center justify-center gap-1.5 text-[12px] text-slate-400 font-black uppercase tracking-[0.2em] dark:text-slate-500 md:justify-end",
                                isRtl ? "flex-row-reverse" : "flex-row",
                            )}
                        >
                            {isRtl ? (
                                <>
                                    <span>{canExportLeads ? t('leads.pageHeroSubtitle') : '🔒 عرض: عملائك فقط'}</span>
                                    <CheckCircle2 size={12} className="text-blue-500" />
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={12} className="text-blue-500" />
                                    <span>{canExportLeads ? t('leads.pageHeroSubtitle') : '🔒 عرض: عملائك فقط'}</span>
                                </>
                            )}
                        </p>
                    </div>
                </div>

                <LeadModal
                    isOpen={isModalOpen}
                    lead={selectedLead}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedLead(null);
                        fetchLeads();
                    }}
                />

                <BulkAssignModal
                    isOpen={isBulkModalOpen}
                    leadIds={selectedLeadIds}
                    onClose={() => {
                        setIsBulkModalOpen(false);
                        setSelectedLeadIds([]);
                        fetchLeads();
                    }}
                />

                {isWhatsAppBroadcastOpen && (
                    <WhatsAppBroadcastModal
                        leads={leads.filter((l) => selectedLeadIds.includes(Number(l.id)))}
                        onClose={() => setIsWhatsAppBroadcastOpen(false)}
                    />
                )}

                <Modal
                    isOpen={exportModalOpen}
                    onClose={() => !exporting && setExportModalOpen(false)}
                    title={t('leads.exportLeadsToExcel')}
                    subtitle={t('leads.exportModalSubtitle')}
                >
                    <div className="w-full space-y-4">
                        <div className="modal-card-inset border-sira-border/80 p-3">
                            <p className="text-xs font-bold text-foreground">
                                {t('leads.currentFilteredCount')}: <span className="text-[#0B1828]">{totalLeads}</span>
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {activeFilterLabels.length === 0 ? (
                                    <span className="text-[11px] text-sira-text-muted">{t('leads.noFiltersApplied')}</span>
                                ) : (
                                    activeFilterLabels.map((label: string) => (
                                        <span
                                            key={label}
                                            className="rounded-lg border border-sira-border bg-sira-bg-page px-2 py-1 text-[11px] font-semibold text-foreground/80"
                                        >
                                            {label}
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="modal-segment flex-col !gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => setExportMode('all')}
                                className={`modal-segment-btn !flex-none sm:flex-1 ${exportMode === 'all' ? 'modal-segment-btn-active' : 'modal-segment-btn-idle'}`}
                            >
                                {t('leads.allLeadsCurrentFilters')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setExportMode('selected')}
                                className={`modal-segment-btn !flex-none sm:flex-1 ${exportMode === 'selected' ? 'modal-segment-btn-active' : 'modal-segment-btn-idle'}`}
                            >
                                {t('leads.selectedLeads', { count: selectedLeadIds.length })}
                            </button>
                        </div>
                        <div className="modal-actions-stack border-0 pt-2">
                            <button
                                type="button"
                                disabled={exporting}
                                onClick={handleExportLeads}
                                className="modal-btn-primary"
                            >
                                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                {t('leads.export')}
                            </button>
                            <button
                                type="button"
                                disabled={exporting}
                                onClick={() => setExportModalOpen(false)}
                                className="modal-cancel-link"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={noteModalOpen}
                    onClose={() => {
                        if (noteSaving) return;
                        setNoteModalOpen(false);
                        setNoteLead(null);
                        setNoteText('');
                    }}
                    title={t('leads.addNote', { defaultValue: 'Add note' })}
                    subtitle={t('leads.addNoteSubtitle', { defaultValue: 'ADD NOTE FOR LEAD' })}
                >
                    <div className="w-full space-y-4">
                        <p className="text-xs font-bold text-slate-500">
                            {noteLead
                                ? `${noteLead.firstName ?? ''} ${noteLead.lastName ?? ''}`.trim() || `#${noteLead.id}`
                                : ''}
                        </p>
                        <textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            rows={5}
                            placeholder={t('leads.notePrompt', { defaultValue: 'Write your note about this lead:' })}
                            className="modal-textarea"
                        />
                        <div className="modal-actions-stack">
                            <button
                                type="button"
                                disabled={noteSaving}
                                onClick={handleSaveLeadNote}
                                className="modal-btn-primary"
                            >
                                {noteSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                                {t('common.save')}
                            </button>
                            <button
                                type="button"
                                disabled={noteSaving}
                                onClick={() => {
                                    setNoteModalOpen(false);
                                    setNoteLead(null);
                                    setNoteText('');
                                }}
                                className="modal-cancel-link"
                            >
                                {t('common.cancel')}
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={rotationConfirmLeadId != null}
                    onClose={() => {
                        if (rotatingLeadId != null) return;
                        setRotationConfirmLeadId(null);
                    }}
                    title={t('leads.confirmRotationTitle', { defaultValue: 'Confirm rotation' })}
                    subtitle={t('leads.confirmRotationSubtitle', { defaultValue: 'CONFIRM ACTION' })}
                >
                    <div className="w-full space-y-4">
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                            {t('leads.rotationRowConfirmEngaged')}
                        </p>
                        <div className="modal-actions-stack">
                            <button
                                type="button"
                                disabled={rotatingLeadId != null}
                                onClick={handleConfirmForceRotation}
                                className="modal-btn-primary"
                            >
                                {rotatingLeadId != null ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {t('common.yes', { defaultValue: 'Yes' })}
                            </button>
                            <button
                                type="button"
                                disabled={rotatingLeadId != null}
                                onClick={() => setRotationConfirmLeadId(null)}
                                className="modal-cancel-link"
                            >
                                {t('common.no', { defaultValue: 'No' })}
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal
                    isOpen={batchToDelete != null}
                    onClose={() => setBatchToDelete(null)}
                    title={t('campaignsPage.deleteBatchTitle')}
                    subtitle={t('leads.deleteModalSubtitle')}
                >
                    <div className="w-full space-y-4">
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                            {t('campaignsPage.deleteBatchWarning', {
                                count: Number(batchToDelete?._count?.leads ?? 0),
                            })}
                        </p>
                        <div className="modal-actions-stack">
                            <button
                                type="button"
                                onClick={handleDeleteBatchConfirm}
                                className="modal-btn-primary"
                            >
                                {t('common.yes', { defaultValue: 'Yes' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => setBatchToDelete(null)}
                                className="modal-cancel-link"
                            >
                                {t('common.no', { defaultValue: 'No' })}
                            </button>
                        </div>
                    </div>
                </Modal>

                {isSales && salesFeedbackLead && currentUser?.id != null ? (
                    <AddFeedbackModal
                        leadId={Number(salesFeedbackLead.id)}
                        userId={Number(currentUser.id)}
                        currentStatus={String(salesFeedbackLead.status || 'new_lead')}
                        onClose={() => setSalesFeedbackLead(null)}
                        onSuccess={() => {
                            setSalesFeedbackLead(null);
                            void fetchLeads();
                        }}
                    />
                ) : null}

                <Modal
                    isOpen={!!leadToDelete}
                    onClose={() => !deleting && setLeadToDelete(null)}
                    title={t('leads.deleteLead')}
                    subtitle={t('leads.deleteModalSubtitle')}
                >
                    {leadToDelete && (
                        <div className="space-y-4">
                            <p className="text-foreground/80 text-sm">
                                {t('leads.deleteLeadQuestion', { name: [(leadToDelete.firstName || '').trim(), (leadToDelete.lastName || '').trim()].filter(Boolean).join(' ') || t('leads.thisLead') })}
                            </p>
                            <div className="flex gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setLeadToDelete(null)}
                                    disabled={deleting}
                                    className="flex-1 rounded-2xl border-2 border-sira-border bg-muted/50 py-4 text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteConfirm}
                                    disabled={deleting}
                                    className="flex-1 rounded-2xl border-2 border-red-700 bg-red-50 py-4 text-xs font-black uppercase tracking-widest text-red-900 transition-colors hover:bg-red-100 disabled:opacity-50"
                                >
                                    {deleting ? t('leads.deleting') : t('leads.delete')}
                                </button>
                            </div>
                        </div>
                    )}
                </Modal>
                <Modal
                    isOpen={bulkDeleteConfirmOpen}
                    onClose={() => !bulkDeleting && setBulkDeleteConfirmOpen(false)}
                    title={t('leads.deleteLead')}
                    subtitle={t('leads.deleteModalSubtitle')}
                >
                    <div className="space-y-4">
                        <p className="text-foreground/80 text-sm">
                            {t('leads.bulkDeleteQuestion', {
                                count: selectedLeadIds.length,
                                defaultValue: `Delete ${selectedLeadIds.length} selected leads? This cannot be undone.`,
                            })}
                        </p>
                        <div className="flex gap-4 pt-2">
                            <button
                                type="button"
                                onClick={() => setBulkDeleteConfirmOpen(false)}
                                disabled={bulkDeleting}
                                className="flex-1 rounded-2xl border-2 border-sira-border bg-muted/50 py-4 text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkDeleteConfirm}
                                disabled={bulkDeleting}
                                className="flex-1 rounded-2xl border-2 border-red-700 bg-red-50 py-4 text-xs font-black uppercase tracking-widest text-red-900 transition-colors hover:bg-red-100 disabled:opacity-50"
                            >
                                {bulkDeleting ? t('leads.deleting') : t('leads.delete')}
                            </button>
                        </div>
                    </div>
                </Modal>

                <div className="overflow-hidden rounded-[3rem] border border-slate-100 bg-white shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                    <div className="flex flex-col gap-5 bg-white p-5 dark:bg-sira-bg-card md:p-6">
                        <div className="flex flex-col md:flex-row w-full gap-4 md:items-stretch">
                            <div className="relative flex-1 min-w-0 group">
                                <Search className={`absolute ${isRtl ? 'right-5' : 'left-5'} top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 transition-colors group-focus-within:text-[#0B1828]`} />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) => setSearchInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setSearch(searchInput), setCurrentPage(1))}
                                    placeholder={t('leads.searchPlaceholder')}
                                    className={`h-12 w-full ${isRtl ? 'pr-12 pl-6' : 'pl-12 pr-6'} rounded-full border border-slate-200 bg-slate-50/80 text-[11px] font-bold text-[#0B1828] !text-black outline-none transition-all focus:border-[#0B1828] dark:border-sira-border dark:bg-foreground/5 dark:focus:border-sira-gold md:h-14 md:text-[12px]`}
                                />
                            </div>
                            <div className="flex gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { setSearch(searchInput); setCurrentPage(1); }}
                                    className="h-12 rounded-full bg-[#0a1121] px-8 text-[9px] font-black uppercase tracking-wide text-white shadow-lg transition hover:brightness-110 active:scale-95 md:h-14 md:px-10 md:text-[12px]"
                                >
                                    {t('leads.search')}
                                </button>
                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchInput(''); setSearch(''); setCurrentPage(1); }}
                                        className="h-12 rounded-full border border-slate-200 px-5 text-[13px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:text-[#0a1121] dark:border-sira-border dark:text-slate-400 dark:hover:text-foreground md:h-14"
                                        title={t('leads.clearSearch')}
                                    >
                                        {t('leads.clear')}
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                            <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">{t('leads.quickFilters')}</span>
                            <div className="flex flex-wrap gap-2.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTypeFilter('');
                                        setDataBatchIdFilter('');
                                        setCampaignIdFilter('');
                                        setPlatformFilter('');
                                        setBatchKindFilter('');
                                        setImportSourceFilter('');
                                        setListView('all');
                                        setCurrentPage(1);
                                    }}
                                    className={`h-10 rounded-full px-5 text-[10px] font-black uppercase tracking-wide transition-all md:h-11 md:text-[13px] ${typeFilter === '' && listView === 'all' && !batchKindFilter ? 'bg-[#0B1828] text-white shadow-md' : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-[#0B1828] hover:text-white transition-colors'}`}
                                >
                                    {t('leads.all')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTypeFilter('platform');
                                        setPlatformFilter('');
                                        setDataBatchIdFilter('');
                                        setCampaignIdFilter('');
                                        setBatchKindFilter('');
                                        setImportSourceFilter('');
                                        setListView((prev) => prev);
                                        setCurrentPage(1);
                                    }}
                                    className={`h-10 rounded-full px-5 text-[10px] font-black uppercase tracking-wide transition-all md:h-11 md:text-[13px] ${typeFilter === 'platform' ? 'bg-[#0B1828] text-white shadow-md' : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-[#0B1828] hover:text-white transition-colors'}`}
                                >
                                    {t('leads.platform')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTypeFilter('cold_call');
                                        setDataBatchIdFilter('');
                                        setCampaignIdFilter('');
                                        setPlatformFilter('');
                                        setBatchKindFilter('');
                                        setImportSourceFilter('');
                                        setListView((prev) => prev);
                                        setCurrentPage(1);
                                    }}
                                    className={`h-10 rounded-full px-5 text-[10px] font-black uppercase tracking-wide transition-all md:h-11 md:text-[13px] ${typeFilter === 'cold_call' ? 'bg-[#0B1828] text-white shadow-md' : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-[#0B1828] hover:text-white transition-colors'}`}
                                >
                                    {t('leads.coldCall')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTypeFilter('campaign');
                                        setDataBatchIdFilter('');
                                        setCampaignIdFilter('');
                                        setPlatformFilter('');
                                        setBatchKindFilter('');
                                        setImportSourceFilter('');
                                        setListView((prev) => prev);
                                        setCurrentPage(1);
                                    }}
                                    className={`h-10 rounded-full px-5 text-[10px] font-black uppercase tracking-wide transition-all md:h-11 md:text-[13px] ${typeFilter === 'campaign' || !!batchKindFilter ? 'bg-[#0B1828] text-white shadow-md' : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-[#0B1828] hover:text-white transition-colors'}`}
                                >
                                    {t('leads.campaign')}
                                </button>
                                {!isSales ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setListView('rotation');
                                            setCurrentPage(1);
                                            setAssigneePresenceFilter('unassigned');
                                        }}
                                        className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[10px] font-black uppercase tracking-wide transition-all md:h-11 md:text-[13px] ${listView === 'rotation' ? 'bg-[#0B1828] text-white shadow-md' : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-[#0B1828] hover:text-white transition-colors'}`}
                                    >
                                        <RotateCw className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" aria-hidden />
                                        {t('leads.rotation')}
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                            <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                {t('leads.datePeriodFilter')}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {(
                                    [
                                        { key: 'all' as const, labelKey: 'leads.datePreset.all' },
                                        { key: 'day' as const, labelKey: 'leads.datePreset.day' },
                                        { key: 'week' as const, labelKey: 'leads.datePreset.week' },
                                        { key: 'month' as const, labelKey: 'leads.datePreset.month' },
                                        { key: 'year' as const, labelKey: 'leads.datePreset.year' },
                                    ] as const
                                ).map(({ key, labelKey }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => applyDatePreset(key)}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            dateRangePreset === key
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t(labelKey)}
                                    </button>
                                ))}
                            </div>
                            <div className="relative" ref={datePickerRef}>
                                <button
                                    type="button"
                                    onClick={() => setDatePickerOpen((v) => !v)}
                                    className="flex h-11 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-left text-[11px] font-bold text-[#0B1828] outline-none transition-colors hover:border-[#0B1828] focus:border-[#0B1828] dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground"
                                >
                                    <span className="truncate">
                                        {dateFrom && dateTo
                                            ? `${dateFrom}  ->  ${dateTo}`
                                            : dateFrom
                                                ? `${t('leads.from')}: ${dateFrom}`
                                                : dateTo
                                                    ? `${t('leads.to')}: ${dateTo}`
                                                    : t('leads.datePeriodFilter')}
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {(dateFrom || dateTo) && (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDateFrom('');
                                                    setDateTo('');
                                                    setDateRangePreset('all');
                                                    setCurrentPage(1);
                                                }}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-[#0B1828]"
                                                aria-label={t('common.clear', { defaultValue: 'Clear' })}
                                                role="button"
                                            >
                                                <CloseIcon className="h-3.5 w-3.5" />
                                            </span>
                                        )}
                                        <CalendarDays className="h-4 w-4 text-slate-500" />
                                    </span>
                                </button>
                                {datePickerOpen ? (
                                    <div
                                        className={cn(
                                            'absolute z-30 mt-2 w-[min(18rem,calc(100vw-1.5rem))] max-w-[18rem] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-sira-border dark:bg-sira-bg-card',
                                            isRtl ? 'right-0' : 'left-0',
                                        )}
                                    >
                                        <DayPicker
                                            mode="range"
                                            numberOfMonths={1}
                                            dir={isRtl ? 'rtl' : 'ltr'}
                                            locale={isRtl ? arSA : enUS}
                                            captionLayout="dropdown"
                                            components={{ Dropdown: DayPickerShadcnDropdown }}
                                            fromYear={2020}
                                            toYear={new Date().getFullYear() + 2}
                                            selected={selectedDateRange}
                                            onSelect={(range: DateRange | undefined) => {
                                                setDateRangePreset('all');
                                                setDateFrom(range?.from ? toLocalYmd(range.from) : '');
                                                setDateTo(range?.to ? toLocalYmd(range.to) : '');
                                                setCurrentPage(1);
                                            }}
                                            className="leads-range-calendar"
                                        />
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {typeFilter === 'platform' ? (
                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                                <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                    {t('leads.platformChannel')}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPlatformFilter('');
                                            setListView((prev) => prev);
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            platformFilter === ''
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.allChannels')}
                                    </button>
                                    {LEAD_INBOUND_PLATFORM_FILTERS.filter((opt) => opt.value !== 'cold_call').map((opt) => {
                                        const active = platformFilter === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setTypeFilter('platform');
                                                    setDataBatchIdFilter('');
                                                    setCampaignIdFilter('');
                                                    setPlatformFilter(active ? '' : opt.value);
                                                    setListView((prev) => prev);
                                                    setCurrentPage(1);
                                                }}
                                                className={cn(
                                                    'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                                    active
                                                        ? 'bg-slate-800 text-white shadow-md ring-2 ring-[#0B1828]/25'
                                                        : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                                )}
                                            >
                                                {t(opt.labelKey)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {(typeFilter === 'campaign' || !!batchKindFilter || listView === 'rotation') ? (
                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                                <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                    {t('leads.campaignFilters')}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setTypeFilter('campaign');
                                            setBatchKindFilter('');
                                            setDataBatchIdFilter('');
                                            setCampaignIdFilter('');
                                            setImportSourceFilter('');
                                            setListView((prev) => prev);
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            !batchKindFilter && typeFilter === 'campaign'
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.allCampaigns')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBatchKindFilter('ads');
                                            setTypeFilter('campaign');
                                            setDataBatchIdFilter('');
                                            setCampaignIdFilter('');
                                            setListView((prev) => prev);
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            batchKindFilter === 'ads'
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.batchKindAdsProject')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setBatchKindFilter('resale');
                                            setTypeFilter('campaign');
                                            setDataBatchIdFilter('');
                                            setCampaignIdFilter('');
                                            setListView((prev) => prev);
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            batchKindFilter === 'resale'
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.batchKindResale')}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {(typeFilter === 'platform' || typeFilter === 'cold_call' || typeFilter === 'campaign' || listView === 'rotation') ? (
                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                                <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                    {t('leads.dataSource')}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImportSourceFilter('');
                                            setDataBatchIdFilter('');
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            importSourceFilter === ''
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.all')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = importSourceFilter === 'manual' ? '' : 'manual';
                                            setImportSourceFilter(next);
                                            setDataBatchIdFilter('');
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            importSourceFilter === 'manual'
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.manual')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = importSourceFilter === 'batches' ? '' : 'batches';
                                            setImportSourceFilter(next);
                                            setDataBatchIdFilter('');
                                            // If campaign has no explicit subtype, keep all campaign batches.
                                            if (typeFilter === 'campaign' && next !== 'batches') {
                                                setBatchKindFilter('');
                                            }
                                            setCurrentPage(1);
                                        }}
                                        className={cn(
                                            'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                            importSourceFilter === 'batches'
                                                ? 'bg-[#0B1828] text-white shadow-md'
                                                : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                        )}
                                    >
                                        {t('leads.batches')}
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {/* Show selectable non-manual batches only when batches source is chosen */}
                        {dataBatches.length > 0 &&
                            (importSourceFilter === 'batches' || listView === 'rotation') &&
                            (typeFilter === 'platform' || typeFilter === 'cold_call' || typeFilter === 'campaign' || !!batchKindFilter || listView === 'rotation') && (
                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                                    <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                        {t('leads.specificBatch')}
                                    </span>
                                    <div className="mt-2 flex flex-wrap gap-2 animate-in fade-in duration-200">
                                        {dataBatches
                                            .filter((b: any) => {
                                                const ds = String(b.dataSource || '').toLowerCase();
                                                const isPlatformImport =
                                                    ds === 'dubizzle' ||
                                                    ds === 'bayut' ||
                                                    ds === 'aqarmap' ||
                                                    ds === 'property_finder_egypt';
                                                const isCampaignImport = ds === 'ads' || ds === 'resale';
                                                if (typeFilter === 'platform') return isPlatformImport;
                                                if (typeFilter === 'cold_call') return ds === 'cold_call';
                                                if (batchKindFilter === 'ads') return ds === 'ads';
                                                if (batchKindFilter === 'resale') return ds === 'resale';
                                                if (typeFilter === 'campaign' && !batchKindFilter) return isCampaignImport;
                                                return true;
                                            })
                                            .filter((b: any) => Number(b._count?.leads ?? 0) > 0)
                                            .sort((a: any, b: any) =>
                                                String(a.batchName ?? '').localeCompare(String(b.batchName ?? '')),
                                            )
                                            .map((batch: any) => {
                                                const batchValue = String(batch.id);
                                                const active = dataBatchIdFilter === batchValue;
                                                const leadN = Number(batch._count?.leads ?? 0);
                                                return (
                                                    <div key={batchValue} className="flex items-start gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setDataBatchIdFilter(active ? '' : batchValue);
                                                                setListView((prev) => prev);
                                                                setCurrentPage(1);
                                                            }}
                                                            className={cn(
                                                                'h-auto min-h-9 max-w-[300px] rounded-full px-4 py-1.5 text-start text-[10px] font-black uppercase tracking-wide transition-all md:min-h-10 md:px-5 md:text-[11px]',
                                                                active
                                                                    ? 'bg-slate-800 text-white shadow-md ring-2 ring-[#0B1828]/25'
                                                                    : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                                            )}
                                                            title={`${batch.batchName || `#${batchValue}`} — ${dataBatchMarketingLabel(batch.dataSource, t)} (${leadN})`}
                                                        >
                                                            <span className="block max-w-[240px] truncate">
                                                                {batch.batchName || `#${batchValue}`}{' '}
                                                                <span className="tabular-nums opacity-80">({leadN})</span>
                                                            </span>
                                                            <span className="mt-0.5 block text-[9px] font-bold normal-case tracking-normal opacity-80">
                                                                {dataBatchMarketingLabel(batch.dataSource, t)}
                                                            </span>
                                                        </button>
                                                        {canDeleteBatches ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleDeleteBatch(batch, e)}
                                                                title={t('campaignsPage.deleteBatchAria')}
                                                                className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                        {!isSales ? (
                            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-sira-border/60">
                                <span className="text-[12px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                                    {t('leads.owner')}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { value: '', label: t('leads.anyOwner') },
                                        { value: 'assigned', label: t('leads.hasOwner') },
                                        { value: 'unassigned', label: t('leads.noOwner') },
                                    ].map((opt) => {
                                        const active = assigneePresenceFilter === opt.value;
                                        return (
                                            <button
                                                key={opt.value || '__owner_any__'}
                                                type="button"
                                                onClick={() => {
                                                    setAssigneePresenceFilter(opt.value as '' | 'assigned' | 'unassigned');
                                                    setCurrentPage(1);
                                                }}
                                                className={cn(
                                                    'h-9 rounded-full px-4 text-[10px] font-black uppercase tracking-wide transition-all md:h-10 md:px-5 md:text-[11px]',
                                                    active
                                                        ? 'bg-[#0B1828] text-white shadow-md'
                                                        : 'border border-slate-200 bg-white text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:hover:bg-foreground/10',
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        <div className="mb-4 space-y-4">
                            <span className="mb-2 block px-0.5 text-[12px] font-black uppercase tracking-widest text-[#0B1828]">
                                {t('leads.status')}
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: '', label: t('leads.all') },
                                    ...FEEDBACK_GRID_ORDER.map((value) => ({
                                        value,
                                        label: translateLeadStatus(t, value),
                                    })),
                                ].map((statusOption) => {
                                    const active = statusFilter === statusOption.value;
                                    const chipTone = statusOption.value
                                        ? leadStatusBadgeClass(statusOption.value)
                                        : 'bg-slate-100 text-[#0B1828]';
                                    return (
                                        <button
                                            key={statusOption.value || '__all_status__'}
                                            type="button"
                                            onClick={() => {
                                                setStatusFilter(statusOption.value);
                                                setCurrentPage(1);
                                            }}
                                            className={`h-9 rounded-full px-4 text-[10px] font-black tracking-wide transition-all md:h-10 md:text-[11px] ${active
                                                ? 'border border-transparent bg-[#0B1828] text-white shadow-md ring-2 ring-[#0B1828]/15'
                                                : `${chipTone} border border-slate-200 hover:brightness-95`
                                                }`}
                                        >
                                            <span>{statusOption.label}</span>
                                            <span className={cn('ms-1 tabular-nums opacity-80', active ? 'text-white/90' : 'text-slate-500')}>
                                                ({statusOption.value ? (statusCounts[statusOption.value] || 0) : (statusCounts.__all__ ?? totalLeads)})
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                    </div>

                    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden dark:bg-sira-bg-card dark:border-sira-border p-4 md:p-8">
                        {/* Scrollable Container for Scoped Infinite Scroll */}
                        <div
                            ref={tableContainerRef}
                            className="overflow-y-auto custom-scrollbar"
                            style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '400px' }}
                        >
                            <div className="hidden md:block">
                                <table className="w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:bg-foreground/5 dark:border-sira-border/50">
                                            <th className="px-6 py-6 text-start">
                                                <button
                                                    onClick={toggleAllLeads}
                                                    className={`flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-all ${leads.length > 0 && leads.every((l) => selectedLeadIds.includes(Number(l.id))) ? 'border-[#0B1828] bg-[#0B1828] text-white' : 'border-slate-200 dark:border-sira-border hover:border-[#0B1828]'}`}
                                                >
                                                    {leads.length > 0 && leads.every((l) => selectedLeadIds.includes(Number(l.id))) && (
                                                        <div className="h-2 w-2 rounded-sm bg-white" />
                                                    )}
                                                </button>
                                            </th>
                                            <th className={cn("px-6 py-4", isRtl ? "text-right" : "text-left")}>{t('leads.clientName')}</th>
                                            <th className="px-3 py-4 text-start">{t('leads.phone')}</th>
                                            <th className="px-6 py-4 text-center">{t('leads.clientType')}</th>
                                            <th className="px-6 py-4 text-center">{t('leads.status')}</th>
                                            <th className="px-6 py-4 text-start">{t('leads.assignedTo')}</th>
                                            <th className="px-3 py-4 text-center">{t('leads.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-sira-border/50">
                                        {loading && currentPage === 1 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-16 text-center">
                                                    <div className="flex flex-col items-center gap-4">
                                                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-100 border-t-[#0a1121]" />
                                                        <p className="text-[13px] font-bold text-slate-600 dark:text-slate-400">{t('leads.synchronizingLeads')}</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : leads.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-16 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <Phone size={32} className="text-slate-200 dark:text-foreground/15" />
                                                        <p className="text-[15px] font-bold text-slate-600 dark:text-slate-400">
                                                            {listView === 'rotation' ? t('leads.noLeadsInRotation') : t('leads.noLeadsFound')}
                                                        </p>
                                                        {search ||
                                                            modeFilter ||
                                                            typeFilter ||
                                                            platformFilter ||
                                                            dateFrom ||
                                                            dateTo ||
                                                            assigneePresenceFilter ||
                                                            listView === 'rotation' ||
                                                            dataBatchIdFilter ||
                                                            campaignIdFilter.trim() ||
                                                            batchKindFilter ||
                                                            importSourceFilter ||
                                                            statusFilter ? (
                                                            <p className="max-w-sm text-[13px] text-slate-500 dark:text-slate-400">{t('leads.tryClearingFilters')}</p>
                                                        ) : isSales ? (
                                                            <p className="max-w-sm text-[13px] text-slate-500 dark:text-slate-400">{t('leads.salesEmptyHint')}</p>
                                                        ) : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            leads.map((lead) => {
                                                return (
                                                    <tr
                                                        key={lead.id}
                                                        className={`group cursor-pointer transition-all hover:bg-slate-50/60 dark:hover:bg-foreground/5 ${selectedLeadIds.includes(Number(lead.id)) ? 'bg-slate-50 ring-1 ring-inset ring-[#BF9B30]/30 dark:bg-slate-900/30' : ''}`}
                                                        onClick={() => navigateToLead(lead.id)}
                                                    >
                                                        <td className="px-6 py-5" onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                onClick={() => toggleLeadSelection(Number(lead.id))}
                                                                className={`flex h-5 w-5 items-center justify-center rounded-lg border-2 transition-all ${selectedLeadIds.includes(Number(lead.id)) ? 'border-[#0B1828] bg-[#0B1828] text-white' : 'border-slate-200 dark:border-sira-border hover:border-[#0B1828]'}`}
                                                            >
                                                                {selectedLeadIds.includes(Number(lead.id)) && (
                                                                    <div className="h-2 w-2 rounded-sm bg-white" />
                                                                )}
                                                            </button>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-9 w-9 rounded-xl border border-slate-100 bg-slate-50 text-xs font-semibold text-[#0B1828] dark:border-sira-border dark:bg-foreground/5 dark:text-foreground flex items-center justify-center">
                                                                    {(lead.firstName?.[0] || '') + (lead.lastName?.[0] || '')}
                                                                </div>
                                                                <div className={`min-w-0 ${isRtl ? 'text-right' : 'text-left'}`}>
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <p className={cn("truncate whitespace-nowrap font-semibold text-[#0B1828] dark:text-white text-[15px]")}>
                                                                            {lead.firstName} {lead.lastName}
                                                                        </p>
                                                                        {isRecentlyTransferred(lead) && (
                                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 border border-amber-200 shrink-0">
                                                                                ↪ محول
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className={cn("font-medium uppercase tracking-wide text-blue-600 dark:text-blue-400 text-[11px]")}>
                                                                        {leadTableSourceLine(lead)}
                                                                    </span>
                                                                    {(() => {
                                                                        const batchLine = leadInlineBatchName(lead);
                                                                        if (batchLine) {
                                                                            return (
                                                                                <span
                                                                                    className="mt-0.5 block max-w-[min(100%,28rem)] truncate text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-500"
                                                                                    title={batchLine}
                                                                                >
                                                                                    {batchLine}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        if (lead.campaign?.name && lead.type !== 'campaign') {
                                                                            return (
                                                                                <span
                                                                                    className="mt-0.5 block max-w-[min(100%,28rem)] truncate text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-500"
                                                                                    title={String(lead.campaign.name)}
                                                                                >
                                                                                    {t('leads.campaign')}: {lead.campaign.name}
                                                                                </span>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center gap-2">
                                                                {isSales ? (
                                                                    <SalesListPhone
                                                                        phone={lead.phone}
                                                                        className="text-[11px] font-black text-slate-600"
                                                                    />
                                                                ) : (
                                                                    <span className="text-[11px] font-black text-slate-600" dir="ltr">
                                                                        {formatPhoneWithCountryCode(lead.phone)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className={cn("font-semibold uppercase tracking-wide text-[#0B1828] dark:text-white text-[13px]")}>
                                                                {lead.type === 'cold_call'
                                                                    ? t('leads.coldCall')
                                                                    : lead.type === 'campaign'
                                                                        ? `${t('leads.campaign')}${lead.campaign?.name ? ` · ${lead.campaign.name}` : ''}`
                                                                        : lead.type === 'platform'
                                                                            ? t('leads.platform')
                                                                            : (t('common.notExist') || 'not exist')}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold tracking-wide ${leadStatusBadgeClass(lead.status)}`}>
                                                                {lead.status ? translateLeadStatus(t, lead.status) : ''}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <span className="text-[11px] font-medium text-slate-500">
                                                                {lead.assignedUser ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` : t('leads.system')}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                {canViewPhone ? (
                                                                    <>
                                                                        <a
                                                                            href={`https://wa.me/${getPhoneDigits(lead.phone)}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                                                                            title="WhatsApp"
                                                                        >
                                                                            <MessageCircle size={14} />
                                                                        </a>
                                                                        <PhoneLookupButton phone={lead.phone} />
                                                                        {isSales && !hasSalesProcedureUnlocked(lead) ? (
                                                                            <a
                                                                                href={`tel:${String(lead.phone || '').replace(/[^\d+]/g, '')}`}
                                                                                className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all"
                                                                                title={t('leads.callNow', { defaultValue: 'Call now' })}
                                                                                dir="ltr"
                                                                            >
                                                                                <Phone size={14} />
                                                                            </a>
                                                                        ) : null}
                                                                        {isSales && hasSalesProcedureUnlocked(lead) ? (
                                                                            <>
                                                                                <a
                                                                                    href={`tel:${String(lead.phone || '').replace(/[^\d+]/g, '')}`}
                                                                                    className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all"
                                                                                    title={t('leads.callNow', { defaultValue: 'Call now' })}
                                                                                    dir="ltr"
                                                                                >
                                                                                    <Phone size={14} />
                                                                                </a>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={currentUser?.id == null}
                                                                                    onClick={() => setSalesFeedbackLead(lead)}
                                                                                    className="w-8 h-8 bg-violet-50 text-violet-700 rounded-lg flex items-center justify-center hover:bg-violet-600 hover:text-white transition-all disabled:pointer-events-none disabled:opacity-40"
                                                                                    title={t('leads.updateStatusFeedback', {
                                                                                        defaultValue: 'Update status & feedback',
                                                                                    })}
                                                                                >
                                                                                    <MessageSquare size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleAddLeadNote(lead)}
                                                                                    className="w-8 h-8 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center hover:bg-slate-700 hover:text-white transition-all"
                                                                                    title={t('leads.addNote', { defaultValue: 'Add note' })}
                                                                                >
                                                                                    <FileText size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleToggleSaveLead(lead)}
                                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${savedLeadIds.has(Number(lead.id))
                                                                                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                                                                        : 'bg-slate-50 text-slate-500 hover:bg-[#0B1828] hover:text-white'
                                                                                        }`}
                                                                                    title={t('sidebar.saved', { defaultValue: 'Saved' })}
                                                                                >
                                                                                    <Bookmark size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        navigate('/meetings', {
                                                                                            state: {
                                                                                                openCreate: true,
                                                                                                leadId: Number(lead.id),
                                                                                            },
                                                                                        })
                                                                                    }
                                                                                    className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                                                                                    title={t('meetings.scheduleMeeting', { defaultValue: 'Schedule meeting' })}
                                                                                >
                                                                                    <CalendarPlus size={14} />
                                                                                </button>
                                                                            </>
                                                                        ) : null}
                                                                    </>
                                                                ) : (
                                                                    <button onClick={() => navigateToLead(lead.id)} className="w-8 h-8 bg-[#0B1828] text-white rounded-lg flex items-center justify-center transition-all hover:bg-slate-800" title={t('leads.viewDetails')}><Eye size={14} /></button>
                                                                )}
                                                                {!isSales && (
                                                                    <>
                                                                        <button onClick={() => { setSelectedLead(lead); setIsModalOpen(true); }} className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-lg flex items-center justify-center transition-all hover:bg-blue-600 hover:text-white" title={t('leads.assignLead')}><UserPlus size={14} /></button>
                                                                        {canSendLeadToRotation && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => void handleSendLeadToRotation(lead, e)}
                                                                                disabled={rotatingLeadId === Number(lead.id) || lead.status === 'rotation'}
                                                                                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border border-teal-100 bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                                                                                title={t('leads.sendLeadToRotation')}
                                                                            >
                                                                                {rotatingLeadId === Number(lead.id) ? (
                                                                                    <Loader2 size={14} className="animate-spin" />
                                                                                ) : (
                                                                                    <RotateCw size={14} />
                                                                                )}
                                                                            </button>
                                                                        )}
                                                                        <button onClick={() => handleDeleteClick(lead)} className="w-8 h-8 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center transition-all hover:bg-rose-500 hover:text-white" title={t('leads.deleteLead')}><Trash2 size={14} /></button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-3 p-3 md:hidden">
                                {loading && currentPage === 1 ? (
                                    <div className="rounded-2xl border border-sira-border bg-muted/30 p-6 text-center text-sira-text-muted">
                                        <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-sira-gold" />
                                        <p className="text-xs font-black uppercase tracking-wider">{t('leads.synchronizingLeads')}</p>
                                    </div>
                                ) : leads.length === 0 ? (
                                    <div className="rounded-2xl border border-sira-border bg-muted/30 p-6 text-center text-sira-text-muted">
                                        <p className="text-sm font-bold">{listView === 'rotation' ? t('leads.noLeadsInRotation') : t('leads.noLeadsFound')}</p>
                                    </div>
                                ) : (
                                    leads.map((lead) => (
                                        <div key={`m-${lead.id}`} className="rounded-2xl border border-sira-border bg-sira-bg-card p-4 shadow-sm" onClick={() => navigateToLead(lead.id)}>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); toggleLeadSelection(Number(lead.id)); }}
                                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${selectedLeadIds.includes(Number(lead.id)) ? 'border-[#0B1828] bg-[#0B1828] text-white' : 'border-slate-200 dark:border-sira-border'}`}
                                                >
                                                    {selectedLeadIds.includes(Number(lead.id)) && <div className="h-2 w-2 rounded-sm bg-white" />}
                                                </button>
                                                <div className="w-10 h-10 bg-slate-50 dark:bg-foreground/5 rounded-xl flex items-center justify-center text-xs font-black text-[#0B1828] dark:text-foreground border border-slate-100 dark:border-sira-border shrink-0">
                                                    {(lead.firstName?.[0] || '') + (lead.lastName?.[0] || '')}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className={`truncate font-black text-[#0B1828] dark:text-white ${isRtl ? 'text-xs' : 'text-sm'}`}>{lead.firstName} {lead.lastName}</p>
                                                        {isRecentlyTransferred(lead) && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-700 border border-amber-200 shrink-0">
                                                                ↪ محول
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-[11px] font-bold text-blue-600 dark:text-blue-400">{leadTableSourceLine(lead)}</p>
                                                    {(() => {
                                                        const batchLine = leadInlineBatchName(lead);
                                                        if (batchLine) {
                                                            return (
                                                                <p
                                                                    className="mt-0.5 truncate text-[9px] font-semibold leading-tight text-slate-500 dark:text-slate-500"
                                                                    title={batchLine}
                                                                >
                                                                    {batchLine}
                                                                </p>
                                                            );
                                                        }
                                                        if (lead.campaign?.name && lead.type !== 'campaign') {
                                                            return (
                                                                <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-500 dark:text-slate-500">
                                                                    {t('leads.campaign')}: {lead.campaign.name}
                                                                </p>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black shrink-0 ${leadStatusBadgeClass(lead.status)}`}>
                                                    {lead.status ? translateLeadStatus(t, lead.status) : ''}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                {isSales ? (
                                                    <SalesListPhone phone={lead.phone} className="text-xs font-black text-slate-600" />
                                                ) : (
                                                    <span className="text-xs font-black text-slate-600" dir="ltr">
                                                        {formatPhoneWithCountryCode(lead.phone)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                {canViewPhone ? (
                                                    <>
                                                        <a
                                                            href={`https://wa.me/${getPhoneDigits(lead.phone)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center"
                                                            title="WhatsApp"
                                                        >
                                                            <MessageCircle size={14} />
                                                        </a>
                                                        <PhoneLookupButton phone={lead.phone} />
                                                        {isSales && !hasSalesProcedureUnlocked(lead) ? (
                                                            <a
                                                                href={`tel:${String(lead.phone || '').replace(/[^\d+]/g, '')}`}
                                                                className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"
                                                                title={t('leads.callNow', { defaultValue: 'Call now' })}
                                                                dir="ltr"
                                                            >
                                                                <Phone size={14} />
                                                            </a>
                                                        ) : null}
                                                        {isSales && hasSalesProcedureUnlocked(lead) ? (
                                                            <>
                                                                <a
                                                                    href={`tel:${String(lead.phone || '').replace(/[^\d+]/g, '')}`}
                                                                    className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center"
                                                                    title={t('leads.callNow', { defaultValue: 'Call now' })}
                                                                    dir="ltr"
                                                                >
                                                                    <Phone size={14} />
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    disabled={currentUser?.id == null}
                                                                    onClick={() => setSalesFeedbackLead(lead)}
                                                                    className="w-8 h-8 bg-violet-50 text-violet-700 rounded-lg flex items-center justify-center disabled:pointer-events-none disabled:opacity-40"
                                                                    title={t('leads.updateStatusFeedback', {
                                                                        defaultValue: 'Update status & feedback',
                                                                    })}
                                                                >
                                                                    <MessageSquare size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleAddLeadNote(lead)}
                                                                    className="w-8 h-8 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center"
                                                                    title={t('leads.addNote', { defaultValue: 'Add note' })}
                                                                >
                                                                    <FileText size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleToggleSaveLead(lead)}
                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${savedLeadIds.has(Number(lead.id)) ? 'bg-amber-100 text-amber-700' : 'bg-slate-50 text-slate-500'}`}
                                                                    title={t('sidebar.saved', { defaultValue: 'Saved' })}
                                                                >
                                                                    <Bookmark size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        navigate('/meetings', {
                                                                            state: {
                                                                                openCreate: true,
                                                                                leadId: Number(lead.id),
                                                                            },
                                                                        })
                                                                    }
                                                                    className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all"
                                                                    title={t('meetings.scheduleMeeting', { defaultValue: 'Schedule meeting' })}
                                                                >
                                                                    <CalendarPlus size={14} />
                                                                </button>
                                                            </>
                                                        ) : null}
                                                    </>
                                                ) : (
                                                    <button onClick={() => navigateToLead(lead.id)} className="w-8 h-8 bg-[#0B1828] text-white rounded-lg flex items-center justify-center" title={t('leads.viewDetails')}><Eye size={14} /></button>
                                                )}
                                                {!isSales && (
                                                    <>
                                                        <button onClick={() => { setSelectedLead(lead); setIsModalOpen(true); }} className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-lg flex items-center justify-center" title={t('leads.assignLead')}><UserPlus size={14} /></button>
                                                        {canSendLeadToRotation && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleSendLeadToRotation(lead, e);
                                                                }}
                                                                disabled={rotatingLeadId === Number(lead.id) || lead.status === 'rotation'}
                                                                className="w-8 h-8 rounded-lg flex items-center justify-center border border-teal-100 bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                                                                title={t('leads.sendLeadToRotation')}
                                                            >
                                                                {rotatingLeadId === Number(lead.id) ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <RotateCw size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDeleteClick(lead)} className="w-8 h-8 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg flex items-center justify-center" title={t('leads.deleteLead')}><Trash2 size={14} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Observer Target inside the scrollable container */}
                            {currentPage < totalPages && (
                                <div ref={observerTarget} className="flex justify-center py-10">
                                    <div className="flex items-center gap-3 px-6 py-2 rounded-full bg-slate-50 dark:bg-foreground/5 border border-slate-100 dark:border-sira-border transition-all">
                                        {loadingMore ? (
                                            <div className="flex items-center gap-2 text-sira-gold">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">{t('common.loading', { defaultValue: 'Loading...' })}</span>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                {t('leads.scrollMore', { defaultValue: 'Scroll within table to load more' })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Premium Pagination Block */}
                        {!loading && totalPages > 1 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between p-6 gap-6 border-t border-slate-50 dark:border-sira-border/50 bg-slate-50/30 dark:bg-transparent">
                                <div className="flex flex-col items-center sm:items-start gap-1">
                                    <p className="text-[11px] text-[#0B1828] dark:text-white font-black uppercase tracking-widest">
                                        {t('common.page', { defaultValue: 'Page' })} {currentPage} {t('common.of', { defaultValue: 'of' })} {totalPages}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
                                        {totalLeads} {t('leads.totalLeads', { defaultValue: 'Total Leads' })}
                                    </p>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center bg-white dark:bg-sira-bg-card rounded-2xl p-1.5 border border-slate-200 dark:border-sira-border shadow-premium">
                                        <button
                                            type="button"
                                            onClick={() => { setLeads([]); setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                            disabled={currentPage <= 1}
                                            className="flex items-center justify-center w-10 h-10 rounded-xl text-[#0B1828] dark:text-white hover:bg-slate-50 dark:hover:bg-foreground/5 disabled:opacity-20 transition-all active:scale-90"
                                            title={t('common.previous', { defaultValue: 'Previous' })}
                                        >
                                            {isRtl ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                                        </button>

                                        <div className="h-6 w-[1px] bg-slate-100 dark:bg-sira-border mx-1" />

                                        <div className="flex items-center gap-2 px-3">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{t('common.jumpTo', { defaultValue: 'Go to' })}</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={totalPages}
                                                value={currentPage}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                                        setLeads([]);
                                                        setCurrentPage(val);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }
                                                }}
                                                className="w-12 h-8 text-center rounded-lg bg-slate-100 dark:bg-foreground/5 text-[12px] font-black text-[#0B1828] dark:text-white outline-none focus:ring-2 focus:ring-sira-gold/30 border-none transition-all"
                                            />
                                        </div>

                                        <div className="h-6 w-[1px] bg-slate-100 dark:bg-sira-border mx-1" />

                                        <button
                                            type="button"
                                            onClick={() => { setLeads([]); setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                            disabled={currentPage >= totalPages}
                                            className="flex items-center justify-center w-10 h-10 rounded-xl text-[#0B1828] dark:text-white hover:bg-slate-50 dark:hover:bg-foreground/5 disabled:opacity-20 transition-all active:scale-90"
                                            title={t('common.next', { defaultValue: 'Next' })}
                                        >
                                            {isRtl ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>{/* END outer card wrapper */}

                {/* Floating Bulk Action Bar */}
                {selectedLeadIds.length > 0 && !isBulkModalOpen && (
                        <div
                            className="fixed bottom-4 left-2 right-2 md:bottom-8 md:left-0 md:right-[280px] z-50 flex justify-center pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-200"
                        >
                        <div className="no-scrollbar pointer-events-auto flex w-full max-w-[96vw] items-center gap-2 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white px-3 py-3 text-[#0B1828] shadow-[0_20px_50px_rgba(11,24,40,0.15)] md:w-auto md:max-w-none md:gap-10 md:rounded-[2rem] md:px-12 md:py-5"
                        >
                            <div className="flex shrink-0 items-center gap-2 border-e border-slate-200 pe-3 md:gap-5 md:pe-10">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-base font-black italic text-[#0B1828] shadow-sm md:h-14 md:w-14 md:rounded-2xl md:text-2xl">
                                    {selectedLeadIds.length}
                                </div>
                                <div className="min-w-0 text-start">
                                    <p className="truncate text-[9px] font-black uppercase tracking-widest text-[#0B1828] md:text-xs">
                                        {t('leads.leadsReady')}
                                    </p>
                                    <p className="hidden text-[9px] font-black uppercase tracking-tighter text-slate-500 md:block">
                                        {t('leads.selectedLeads', { count: selectedLeadIds.length })}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-1 items-center justify-end gap-2 md:gap-6">
                                <div className="hidden items-center gap-2 md:flex">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={selectionTargetCount}
                                        onChange={(e) => setSelectionTargetCount(e.target.value.replace(/[^\d]/g, ''))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (selectionByCountLoading) return;
                                                applySelectionTargetCount();
                                            }
                                        }}
                                        className="h-10 w-20 rounded-xl border border-slate-200 bg-slate-50 px-2 text-center text-[10px] font-black text-[#0B1828] outline-none focus:ring-2 focus:ring-sira-gold/30"
                                        placeholder={t('leads.count', { defaultValue: 'Count' })}
                                        aria-label={t('leads.selectionCount', { defaultValue: 'Selection count' })}
                                        disabled={selectionByCountLoading}
                                    />
                                    {selectionByCountLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                                </div>
                                {!isSales && (
                                    <button
                                        type="button"
                                        onClick={() => setIsBulkModalOpen(true)}
                                        className="flex items-center gap-2 rounded-xl border border-[#0B1828] bg-[#0B1828] px-4 py-3 text-[9px] font-black uppercase italic tracking-widest text-white shadow-md transition-all hover:scale-[1.02] hover:bg-slate-800 md:rounded-2xl md:px-10 md:py-4 md:text-[10px]"
                                    >
                                        <UserPlus className="h-3.5 w-3.5 shrink-0" /> {t('leads.assignLead')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsWhatsAppBroadcastOpen(true)}
                                    className="flex items-center gap-2 rounded-xl border border-[#16a34a] bg-[#16a34a] px-4 py-3 text-[9px] font-black uppercase italic tracking-widest text-white shadow-md transition-all hover:scale-[1.02] hover:bg-[#15803d] md:rounded-2xl md:px-8 md:py-4 md:text-[10px]"
                                >
                                    <MessageCircle className="h-3.5 w-3.5 shrink-0" /> واتساب
                                </button>
                                {!isSales && (
                                    <button
                                        type="button"
                                        onClick={() => setBulkDeleteConfirmOpen(true)}
                                        className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[9px] font-black uppercase italic tracking-widest text-rose-700 shadow-sm transition-all hover:scale-[1.02] hover:bg-rose-100 md:rounded-2xl md:px-8 md:py-4 md:text-[10px]"
                                    >
                                        <Trash2 className="h-3.5 w-3.5 shrink-0" /> {t('leads.delete')}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setSelectedLeadIds([])}
                                    className="rounded-xl px-2 py-3 text-[9px] font-black uppercase italic tracking-widest text-slate-500 transition-colors hover:text-[#0B1828] md:px-6 md:py-4 md:text-[10px]"
                                >
                                    {t('leads.clearSelection')}
                                </button>
                            </div>
                        </div>
                        </div>
                    )}
            </div>
        </div>
    );
}