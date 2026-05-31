import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { isAppRtl } from '../lib/i18nDirection';
import { cn } from '../lib/utils';
import {
    TrendingUp,
    Database,
    BarChart3,
    Layers,
    Search,
    Users,
    Banknote,
    Loader2,
    ChevronRight,
    Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from '../lib/toast';
import { deleteDataBatch, getAllDataBatches } from '../services/api';
import { CampaignPlatformIcon } from '../lib/campaignPlatform';
import { canDeleteDataBatch } from '../lib/userRole';
import Modal from '../components/ui/Modal';

const PLATFORM_MARKETPLACE_CODES = new Set(['dubizzle', 'bayut', 'aqarmap', 'property_finder_egypt']);
/** Order used for the Platform tab type filter (matches marketplace codes). */
const PLATFORM_CHANNEL_ORDER = ['dubizzle', 'bayut', 'aqarmap', 'property_finder_egypt'] as const;
const COLD_CALL_CODE = 'cold_call';

const CHANNEL_LABEL_KEYS: Record<string, string> = {
    cold_call: 'leadInjection.platformColdCall',
    dubizzle: 'leadInjection.platformDubizzle',
    bayut: 'leadInjection.platformBayut',
    aqarmap: 'leadInjection.platformAqarmap',
    property_finder_egypt: 'leadInjection.platformPropertyFinderEgypt',
    resale: 'leadInjection.platformResale',
    ads: 'leadInjection.platformAds',
};

function isCampaignLinkedBatch(b: { campaign?: { id?: unknown } | null; campaignId?: unknown } | null | undefined) {
    if (b?.campaign != null && b.campaign.id != null) return true;
    const cid = b?.campaignId;
    if (cid == null || cid === '') return false;
    return String(cid) !== '0';
}

function normalizedBatchSource(b: { dataSource?: unknown }): string {
    return String(b?.dataSource ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

function isPlatformChannelBatch(b: { dataSource?: unknown }): boolean {
    return PLATFORM_MARKETPLACE_CODES.has(normalizedBatchSource(b));
}

function batchSubtitleLine(batch: { dataSource?: unknown }, t: (k: string) => string): string {
    const ds = normalizedBatchSource(batch);
    const key = CHANNEL_LABEL_KEYS[ds];
    if (key) return t(key);
    return String(batch?.dataSource ?? '').trim() || '—';
}

function isStandaloneCampaignDataSource(batch: { dataSource?: unknown }): boolean {
    const ds = normalizedBatchSource(batch);
    return ds === 'ads' || ds === 'resale';
}

function sortBatchesDesc(a: any, b: any): number {
    const diff = Number(b._count?.leads ?? 0) - Number(a._count?.leads ?? 0);
    if (diff !== 0) return diff;
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
}

/** Campaign-type buckets for the Marketing tab (linked vs Ads vs Resale). */
function getMarketingBatchCategory(b: any): 'linked' | 'ads' | 'resale' {
    if (isCampaignLinkedBatch(b)) return 'linked';
    const ds = normalizedBatchSource(b);
    if (ds === 'ads') return 'ads';
    if (ds === 'resale') return 'resale';
    return 'linked';
}

export default function Campaigns() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const navigate = useNavigate();
    const currentUser = useSelector((state: any) => state.user.user);
    const canBulkDelete = canDeleteDataBatch(currentUser);

    const [activeTab, setActiveTab] = useState<'marketing' | 'platform' | 'cold'>('marketing');
    /** Cold call batches are now deletable. */
    const showBatchDeleteUi = canBulkDelete;
    const [loading, setLoading] = useState(true);
    const [batchesRaw, setBatchesRaw] = useState<any[]>([]);
    const [marketingBatchSearch, setMarketingBatchSearch] = useState('');
    const [batchSearchPlatform, setBatchSearchPlatform] = useState('');
    const [batchSearchCold, setBatchSearchCold] = useState('');
    const [marketingTypeFilter, setMarketingTypeFilter] = useState<'all' | 'linked' | 'ads' | 'resale'>('all');
    const [platformChannelFilter, setPlatformChannelFilter] = useState<string>('all');
    const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
    const [deletingBulk, setDeletingBulk] = useState(false);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [idsPendingDelete, setIdsPendingDelete] = useState<string[]>([]);

    useEffect(() => {
        setMarketingBatchSearch('');
        setBatchSearchPlatform('');
        setBatchSearchCold('');
        setMarketingTypeFilter('all');
        setPlatformChannelFilter('all');
        setSelectedBatchIds([]);
        setDeleteModalOpen(false);
        setIdsPendingDelete([]);
    }, [activeTab]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const batchData = await getAllDataBatches();
            const list = Array.isArray(batchData) ? batchData : batchData?.data ?? [];
            setBatchesRaw(Array.isArray(list) ? list : []);
        } catch {
            toast.error(t('campaignsPage.toastLoadFailed'));
            setBatchesRaw([]);
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void fetchData();
    }, [fetchData]);

    const derived = useMemo(() => {
        const list = batchesRaw;
        const linked = list.filter((b: any) => isCampaignLinkedBatch(b));
        const unlinked = list.filter((b: any) => !isCampaignLinkedBatch(b));
        const standaloneCampaign = unlinked.filter((b: any) => isStandaloneCampaignDataSource(b));
        const marketingBatches = [...linked, ...standaloneCampaign].sort(sortBatchesDesc);
        const platformBatches = unlinked.filter((b: any) => isPlatformChannelBatch(b)).sort(sortBatchesDesc);
        const coldBatches = unlinked.filter((b: any) => normalizedBatchSource(b) === COLD_CALL_CODE).sort(sortBatchesDesc);
        return { marketingBatches, platformBatches, coldBatches };
    }, [batchesRaw]);

    const filteredMarketingBatches = useMemo(() => {
        let list = derived.marketingBatches;
        if (marketingTypeFilter !== 'all') {
            list = list.filter((b: any) => getMarketingBatchCategory(b) === marketingTypeFilter);
        }
        const q = marketingBatchSearch.trim().toLowerCase();
        if (!q) return list;
        return list.filter((b: any) => {
            const name = String(b.batchName || '').toLowerCase();
            const src = batchSubtitleLine(b, t).toLowerCase();
            const cname = String(b.campaign?.name || '').toLowerCase();
            return name.includes(q) || src.includes(q) || cname.includes(q);
        });
    }, [derived.marketingBatches, marketingBatchSearch, marketingTypeFilter, t]);

    const filteredPlatformBatches = useMemo(() => {
        let list = derived.platformBatches;
        if (platformChannelFilter !== 'all') {
            list = list.filter((b: any) => normalizedBatchSource(b) === platformChannelFilter);
        }
        const q = batchSearchPlatform.trim().toLowerCase();
        if (!q) return list;
        return list.filter(
            (b: any) =>
                String(b.batchName || '').toLowerCase().includes(q) ||
                String(b.dataSource || '').toLowerCase().includes(q),
        );
    }, [derived.platformBatches, batchSearchPlatform, platformChannelFilter]);

    const filteredColdBatches = useMemo(() => {
        const q = batchSearchCold.trim().toLowerCase();
        if (!q) return derived.coldBatches;
        return derived.coldBatches.filter(
            (b: any) =>
                String(b.batchName || '').toLowerCase().includes(q) ||
                String(b.dataSource || '').toLowerCase().includes(q),
        );
    }, [derived.coldBatches, batchSearchCold]);

    const visibleBatchIdsForTab = useMemo((): string[] => {
        if (activeTab === 'marketing') return filteredMarketingBatches.map((b: any) => String(b.id));
        if (activeTab === 'platform') return filteredPlatformBatches.map((b: any) => String(b.id));
        return filteredColdBatches.map((b: any) => String(b.id));
    }, [activeTab, filteredMarketingBatches, filteredPlatformBatches, filteredColdBatches]);

    const selectedCountOnTab = useMemo(
        () => selectedBatchIds.filter((id) => visibleBatchIdsForTab.includes(id)).length,
        [selectedBatchIds, visibleBatchIdsForTab],
    );

    const toggleBatchSelected = useCallback((id: string) => {
        setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }, []);

    const selectAllVisibleBatches = useCallback(() => {
        setSelectedBatchIds((prev) => {
            const set = new Set(prev);
            visibleBatchIdsForTab.forEach((id) => set.add(id));
            return Array.from(set);
        });
    }, [visibleBatchIdsForTab]);

    const clearBatchSelection = useCallback(() => setSelectedBatchIds([]), []);

    const openDeleteModal = useCallback(() => {
        const ids = selectedBatchIds.filter((id) => visibleBatchIdsForTab.includes(id));
        if (ids.length === 0 || !canBulkDelete) return;
        setIdsPendingDelete(ids);
        setDeleteModalOpen(true);
    }, [activeTab, canBulkDelete, selectedBatchIds, visibleBatchIdsForTab]);

    const closeDeleteModal = useCallback(() => {
        if (deletingBulk) return;
        setDeleteModalOpen(false);
        setIdsPendingDelete([]);
    }, [deletingBulk]);

    const executeBulkDelete = useCallback(async () => {
        const ids = [...idsPendingDelete];
        if (ids.length === 0 || !canBulkDelete) {
            setDeleteModalOpen(false);
            setIdsPendingDelete([]);
            return;
        }
        setDeleteModalOpen(false);
        setIdsPendingDelete([]);
        setDeletingBulk(true);
        let okN = 0;
        let failN = 0;
        for (const id of ids) {
            try {
                await deleteDataBatch(id);
                okN += 1;
            } catch {
                failN += 1;
            }
        }
        setDeletingBulk(false);
        setSelectedBatchIds((prev) => prev.filter((x) => !ids.includes(x)));
        await fetchData();
        if (okN > 0 && failN === 0) {
            toast.success(
                t('campaignsPage.toastBulkBatchesDeleted', {
                    count: okN,
                    defaultValue: '{{count}} batch(es) deleted.',
                }),
            );
        } else if (okN > 0 && failN > 0) {
            toast.warning(
                t('campaignsPage.toastBulkBatchesPartial', {
                    ok: okN,
                    fail: failN,
                    defaultValue: '{{ok}} deleted, {{fail}} could not be deleted.',
                }),
            );
        } else if (failN > 0) {
            toast.error(
                t('campaignsPage.toastBulkBatchesAllFailed', {
                    count: failN,
                    defaultValue: 'Could not delete {{count}} batch(es).',
                }),
            );
        }
    }, [activeTab, canBulkDelete, fetchData, idsPendingDelete, t]);

    const tabs = useMemo(
        () => [
            { id: 'marketing' as const, label: t('campaignsPage.tabMarketing'), icon: TrendingUp },
            { id: 'platform' as const, label: t('campaignsPage.tabPlatform'), icon: Layers },
            { id: 'cold' as const, label: t('campaignsPage.tabColdCall'), icon: Database },
        ],
        [t],
    );

    const marketingHubStats = useMemo(() => {
        const batchLeads = derived.marketingBatches.reduce((a, b: any) => a + Number(b._count?.leads || 0), 0);
        return {
            batches: derived.marketingBatches.length,
            batchLeads,
        };
    }, [derived.marketingBatches]);

    const marketingStatRow = useMemo(
        () =>
            [
                {
                    label: t('campaignsPage.statCampaignTypeBatches', { defaultValue: 'Campaign-type batches' }),
                    value: marketingHubStats.batches,
                    icon: Layers,
                    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
                },
                {
                    label: t('campaignsPage.statMarketingBatchLeads', {
                        defaultValue: 'Leads in campaign batches',
                    }),
                    value: marketingHubStats.batchLeads,
                    icon: BarChart3,
                    className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
                },
            ] as const,
        [marketingHubStats, t],
    );

    const platformHubStats = useMemo(() => {
        const totalLeads = derived.platformBatches.reduce((a, b: any) => a + Number(b._count?.leads || 0), 0);
        return {
            batches: derived.platformBatches.length,
            totalLeads,
        };
    }, [derived.platformBatches]);

    const platformStatRow = useMemo(
        () =>
            [
                {
                    label: t('campaignsPage.statPlatformBatches'),
                    value: platformHubStats.batches,
                    icon: Layers,
                    className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
                },
                {
                    label: t('campaignsPage.statPlatformLeads'),
                    value: platformHubStats.totalLeads,
                    icon: BarChart3,
                    className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
                },
            ] as const,
        [platformHubStats, t],
    );

    const coldHubStats = useMemo(() => {
        const totalLeads = derived.coldBatches.reduce((a, b: any) => a + Number(b._count?.leads || 0), 0);
        return {
            batches: derived.coldBatches.length,
            totalLeads,
        };
    }, [derived.coldBatches]);

    const coldStatRow = useMemo(
        () =>
            [
                {
                    label: t('campaignsPage.statColdBatches'),
                    value: coldHubStats.batches,
                    icon: Database,
                    className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
                },
                {
                    label: t('campaignsPage.statColdLeads'),
                    value: coldHubStats.totalLeads,
                    icon: BarChart3,
                    className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
                },
            ] as const,
        [coldHubStats, t],
    );

    const formatBatchMoney = (v: unknown) => {
        if (v == null || v === '') return '—';
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) return '—';
        return `${n.toLocaleString()} ${t('campaignsPage.currencyEgp')}`;
    };

    const goLeadsBatch = (batchId: string) => {
        navigate('/leads', {
            state: {
                leadsState: {
                    typeFilter: 'batch',
                    dataBatchIdFilter: batchId,
                    campaignIdFilter: '',
                    platformFilter: '',
                    listView: 'all',
                    assigneePresenceFilter: '',
                    page: 1,
                },
            },
        });
    };

    const renderBatchCard = (
        batch: any,
        opts?: { showCheckbox?: boolean; checked?: boolean; onToggle?: () => void },
    ) => {
        const isCampaign = batch.campaign?.id != null;
        const isStandalone = !isCampaign && isStandaloneCampaignDataSource(batch);
        const isPlatformCold = !isCampaign && !isStandalone && isPlatformChannelBatch(batch);
        const leadCount = batch._count?.leads ?? 0;
        const hasImportLine =
            (batch.importedCount ?? 0) > 0 ||
            (batch.skippedDuplicateCount ?? 0) > 0 ||
            (batch.failedImportCount ?? 0) > 0;
        const initial = (batch.batchName || 'B').toString().slice(0, 1).toUpperCase();

        return (
            <div
                key={String(batch.id)}
                className={cn(
                    'group relative flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-[1.875rem] border bg-white p-5 shadow-sm transition-all duration-300 sm:p-6',
                    'hover:-translate-y-0.5 hover:shadow-lg dark:bg-sira-bg-card',
                    isCampaign || isStandalone
                        ? 'border-amber-200/60 hover:border-amber-300/80 dark:border-amber-500/20 dark:hover:border-amber-500/35'
                        : 'border-slate-200/80 hover:border-slate-300/90 dark:border-sira-border',
                )}
            >
                <div className="flex items-start gap-3 pt-0.5">
                    {opts?.showCheckbox ? (
                        <input
                            type="checkbox"
                            className="mt-2 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-[#0B1828] focus:ring-[#BF9B30]"
                            checked={!!opts.checked}
                            onChange={() => opts.onToggle?.()}
                            aria-label={t('campaignsPage.selectBatchAria', { defaultValue: 'Select batch' })}
                        />
                    ) : null}
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                            className={cn(
                                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-inner ring-2 ring-white/20',
                                isCampaign || isStandalone
                                    ? 'bg-gradient-to-br from-[#0B1828] to-slate-800'
                                    : 'bg-[#0B1828]',
                            )}
                        >
                            {initial}
                        </div>
                        <div className="min-w-0">
                            <h3
                                className="truncate text-base font-black tracking-tight text-[#0B1828] dark:text-foreground"
                                title={batch.batchName}
                            >
                                {batch.batchName}
                            </h3>
                            <p
                                className="mt-0.5 line-clamp-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400"
                                title={batchSubtitleLine(batch, t)}
                            >
                                {batchSubtitleLine(batch, t)}
                            </p>
                        </div>
                    </div>
                    <span
                        className={cn(
                            'shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider shadow-sm',
                            isCampaign || isStandalone
                                ? 'border border-amber-200/80 bg-amber-50/95 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-100'
                                : 'border border-slate-200/80 bg-slate-50 text-slate-600 dark:border-sira-border dark:bg-foreground/10 dark:text-foreground/70',
                        )}
                    >
                        {isCampaign || isStandalone
                            ? t('campaignsPage.batchBadgeCampaign')
                            : isPlatformCold
                              ? t('campaignsPage.batchBadgePlatform')
                              : t('campaignsPage.batchBadgeCold')}
                    </span>
                    </div>
                </div>
                {isCampaign && batch.campaign && (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-sira-border dark:bg-foreground/5">
                        <CampaignPlatformIcon campaign={batch.campaign} className="h-4 w-4 shrink-0" />
                        <span className="text-sm font-bold text-foreground/90">{batch.campaign.name}</span>
                    </div>
                )}
                {hasImportLine ? (
                    <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[10px] font-bold text-emerald-900/90 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100/90">
                        <BarChart3 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="leading-snug">
                            {t('campaignsPage.lastImportSummary', {
                                imported: batch.importedCount ?? 0,
                                skipped: batch.skippedDuplicateCount ?? 0,
                                failed: batch.failedImportCount ?? 0,
                            })}
                        </span>
                    </div>
                ) : null}
                <div className="mt-auto grid grid-cols-2 gap-3">
                    <div className="relative overflow-hidden rounded-2xl border border-amber-100/90 bg-gradient-to-br from-amber-50 to-amber-100/50 px-3 py-3.5 text-start shadow-sm dark:border-amber-500/15 dark:from-amber-500/10 dark:to-amber-500/5">
                        <Users className="pointer-events-none absolute -end-1 -top-1 h-14 w-14 text-amber-400/25" aria-hidden />
                        <p className="relative text-[8px] font-black uppercase tracking-widest text-amber-800/85 dark:text-amber-200/90">
                            {t('campaignsPage.leadsInCrm')}
                        </p>
                        <p className="relative mt-1 text-2xl font-black tabular-nums text-amber-950 dark:text-amber-50">
                            {leadCount.toLocaleString()}
                        </p>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50 to-sky-50/40 px-3 py-3.5 text-start shadow-sm dark:border-indigo-500/15">
                        <Banknote className="pointer-events-none absolute -end-1 -top-1 h-14 w-14 text-indigo-400/20" aria-hidden />
                        <p className="relative text-[8px] font-black uppercase tracking-widest text-indigo-800/85 dark:text-indigo-200/90">
                            {t('campaignsPage.purchase')}
                        </p>
                        <p className="relative mt-1 text-lg font-black leading-tight text-indigo-950 dark:text-indigo-50">
                            {formatBatchMoney(batch.purchasePrice)}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => goLeadsBatch(String(batch.id))}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#0B1828]/15 bg-[#0B1828]/5 py-3 text-[11px] font-black uppercase tracking-widest text-[#0B1828] transition hover:bg-[#0B1828]/10 dark:border-sira-border dark:text-foreground dark:hover:bg-foreground/10"
                >
                    {t('campaignsPage.viewLeadsOpen', { defaultValue: 'Open in Leads' })}
                    <ChevronRight className={cn('h-4 w-4', isRtl && 'rotate-180')} />
                </button>
            </div>
        );
    };

    if (loading) {
        return (
            <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-[#0B1828]/50"
            >
                <Loader2 className="h-10 w-10 animate-spin text-[#BF9B30]" />
                <p className="text-[12px] font-black uppercase tracking-widest">{t('dashboard.loading')}</p>
            </div>
        );
    }

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full space-y-8 text-foreground min-h-screen px-4 md:px-8">
            <div
                className="flex w-full max-w-4xl flex-col gap-2 rounded-[1.5rem] border border-slate-200/80 bg-white p-1.5 shadow-sm sm:flex-row sm:gap-0 dark:border-sira-border dark:bg-sira-bg-card"
                role="tablist"
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest transition-all sm:px-5',
                            activeTab === tab.id
                                ? 'bg-[#0B1828] text-white shadow-lg'
                                : 'text-slate-500 hover:bg-slate-100 dark:text-foreground/50 dark:hover:bg-foreground/5',
                        )}
                    >
                        <tab.icon className="h-4 w-4 shrink-0 opacity-80" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'marketing' ? (
                    <motion.div
                        key="marketing"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="space-y-8"
                    >
                        <div className="space-y-1">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0B1828] dark:text-foreground">
                                {t('campaignsPage.hubTitle')}
                            </h1>
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
                                {t('campaignsPage.hubSubtitle')}
                            </p>
                            <p className="pt-2 max-w-3xl text-sm text-slate-500 dark:text-sira-text-muted">
                                {t('campaignsPage.marketingHubReadOnlyIntro', {
                                    defaultValue:
                                        'Campaign-type batches (Ads / resale / linked uploads). Imports are handled from Leads. Use Open in Leads on a batch to filter.',
                                })}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {marketingStatRow.map(({ label, value, icon: Icon, className }) => (
                                <div
                                    key={label}
                                    className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card sm:p-6"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-tight text-start">
                                            {label}
                                        </p>
                                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', className)}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black tabular-nums text-[#0B1828] dark:text-foreground">{value}</p>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-lg font-black text-[#0B1828] dark:text-foreground">{t('campaignsPage.marketingBatchSectionHeading', { defaultValue: 'Campaign-type batches' })}</h2>
                            <p className="max-w-2xl text-sm text-slate-500 dark:text-sira-text-muted">
                                {t('campaignsPage.marketingBatchSectionBlurb', {
                                    defaultValue: 'Imports linked to marketing campaigns plus Ads/resale batches. Opens filtered list in Leads.',
                                })}
                            </p>
                            <div className="overflow-hidden rounded-[1.25rem] border border-slate-200/60 bg-white p-4 dark:border-sira-border dark:bg-sira-bg-card">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-6">
                                    <div className="w-full space-y-2 lg:max-w-[220px]">
                                        <label
                                            htmlFor="campaigns-marketing-type-filter"
                                            className="block text-[10px] font-black uppercase tracking-widest text-slate-400"
                                        >
                                            {t('campaignsPage.filterBatchType', { defaultValue: 'Batch type' })}
                                        </label>
                                        <select
                                            id="campaigns-marketing-type-filter"
                                            value={marketingTypeFilter}
                                            onChange={(e) =>
                                                setMarketingTypeFilter(e.target.value as 'all' | 'linked' | 'ads' | 'resale')
                                            }
                                            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm font-bold outline-none dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                                        >
                                            <option value="all">
                                                {t('campaignsPage.filterBatchTypeAll', { defaultValue: 'All types' })}
                                            </option>
                                            <option value="linked">
                                                {t('campaignsPage.filterBatchTypeLinkedCampaign', {
                                                    defaultValue: 'Linked to campaign',
                                                })}
                                            </option>
                                            <option value="ads">{t('leadInjection.platformAds')}</option>
                                            <option value="resale">
                                                {t('leadInjection.platformResale', { defaultValue: 'Resale' })}
                                            </option>
                                        </select>
                                    </div>
                                    <div className="relative min-w-0 flex-1 lg:max-w-md">
                                        <Search
                                            className={cn(
                                                'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400',
                                                isRtl ? 'right-4' : 'left-4',
                                            )}
                                        />
                                        <input
                                            id="campaigns-marketing-search"
                                            type="text"
                                            value={marketingBatchSearch}
                                            onChange={(e) => setMarketingBatchSearch(e.target.value)}
                                            placeholder={t('campaignsPage.searchCampaignBatches', {
                                                defaultValue: 'Search batches…',
                                            })}
                                            className={cn(
                                                'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 text-sm font-bold outline-none dark:border-sira-border dark:bg-foreground/5 dark:text-foreground',
                                                isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4',
                                            )}
                                        />
                                    </div>
                                </div>
                                {showBatchDeleteUi ? (
                                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-sira-border">
                                        <button
                                            type="button"
                                            onClick={selectAllVisibleBatches}
                                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground dark:hover:bg-foreground/5"
                                        >
                                            {t('campaignsPage.selectAllVisible', { defaultValue: 'Select all' })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={clearBatchSelection}
                                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground/70 dark:hover:bg-foreground/5"
                                        >
                                            {t('campaignsPage.clearSelection', { defaultValue: 'Clear' })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={openDeleteModal}
                                            disabled={selectedCountOnTab === 0 || deletingBulk}
                                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                                        >
                                            {deletingBulk ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                            {t('campaignsPage.deleteSelectedBatches', {
                                                count: selectedCountOnTab,
                                                defaultValue: 'Delete selected ({{count}})',
                                            })}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                            {filteredMarketingBatches.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500 dark:border-sira-border">
                                    {t('campaignsPage.noMarketingBatches', { defaultValue: 'No campaign-type batches.' })}
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                    {filteredMarketingBatches.map((b: any) =>
                                        renderBatchCard(b, {
                                            showCheckbox: showBatchDeleteUi,
                                            checked: selectedBatchIds.includes(String(b.id)),
                                            onToggle: () => toggleBatchSelected(String(b.id)),
                                        }),
                                    )}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : activeTab === 'platform' ? (
                    <motion.div
                        key="platform"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="space-y-8"
                    >
                        <div className="space-y-1">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#0B1828] dark:text-foreground">{t('campaignsPage.platformHubTitle')}</h1>
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">{t('campaignsPage.platformHubSubtitle')}</p>
                            <p className="pt-2 max-w-3xl text-sm text-slate-500 dark:text-sira-text-muted">{t('campaignsPage.platformHubReadOnlyIntro', { defaultValue: t('campaignsPage.platformDataSubtitle') })}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{platformStatRow.map(({ label, value, icon: Icon, className }) => (
                            <div key={label} className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', className)}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                </div>
                                <p className="text-3xl font-black tabular-nums">{value}</p>
                            </div>
                        ))}
                        </div>
                        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-5 dark:border-sira-border dark:bg-sira-bg-card">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-6">
                                <div className="w-full space-y-2 lg:max-w-[240px]">
                                    <label
                                        htmlFor="campaigns-platform-channel-filter"
                                        className="block text-[10px] font-black uppercase tracking-widest text-slate-400"
                                    >
                                        {t('campaignsPage.filterPlatformChannel', { defaultValue: 'Channel' })}
                                    </label>
                                    <select
                                        id="campaigns-platform-channel-filter"
                                        value={platformChannelFilter}
                                        onChange={(e) => setPlatformChannelFilter(e.target.value)}
                                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-4 text-sm font-bold outline-none dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                                    >
                                        <option value="all">
                                            {t('campaignsPage.filterPlatformAll', { defaultValue: 'All channels' })}
                                        </option>
                                        {PLATFORM_CHANNEL_ORDER.map((code) => (
                                            <option key={code} value={code}>
                                                {t(CHANNEL_LABEL_KEYS[code])}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="relative min-w-0 flex-1 lg:max-w-md">
                                    <Search
                                        className={cn(
                                            'pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400',
                                            isRtl ? 'right-4' : 'left-4',
                                        )}
                                    />
                                    <input
                                        id="campaigns-platform-search"
                                        type="text"
                                        value={batchSearchPlatform}
                                        onChange={(e) => setBatchSearchPlatform(e.target.value)}
                                        placeholder={t('campaignsPage.searchBatches')}
                                        className={cn(
                                            'h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 text-sm font-bold outline-none dark:border-sira-border dark:bg-foreground/5 dark:text-foreground',
                                            isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4',
                                        )}
                                    />
                                </div>
                            </div>
                            {showBatchDeleteUi ? (
                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-sira-border">
                                    <button
                                        type="button"
                                        onClick={selectAllVisibleBatches}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground dark:hover:bg-foreground/5"
                                    >
                                        {t('campaignsPage.selectAllVisible', { defaultValue: 'Select all' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearBatchSelection}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground/70 dark:hover:bg-foreground/5"
                                    >
                                        {t('campaignsPage.clearSelection', { defaultValue: 'Clear' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openDeleteModal}
                                        disabled={selectedCountOnTab === 0 || deletingBulk}
                                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                                    >
                                        {deletingBulk ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                        {t('campaignsPage.deleteSelectedBatches', {
                                            count: selectedCountOnTab,
                                            defaultValue: 'Delete selected ({{count}})',
                                        })}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {filteredPlatformBatches.length === 0 ? (
                            <p className="py-14 text-center text-slate-500">{t('campaignsPage.emptyPlatformBatches')}</p>
                        ) : (
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                {filteredPlatformBatches.map((b: any) =>
                                    renderBatchCard(b, {
                                        showCheckbox: showBatchDeleteUi,
                                        checked: selectedBatchIds.includes(String(b.id)),
                                        onToggle: () => toggleBatchSelected(String(b.id)),
                                    }),
                                )}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="cold"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className="space-y-8"
                    >
                        <div className="space-y-1">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{t('campaignsPage.coldHubTitle')}</h1>
                            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">{t('campaignsPage.coldHubSubtitle')}</p>
                            <p className="pt-2 max-w-3xl text-sm text-slate-500 dark:text-sira-text-muted">{t('campaignsPage.coldHubReadOnlyIntro', { defaultValue: t('campaignsPage.coldDataSubtitle') })}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {coldStatRow.map(({ label, value, icon: Icon, className }) => (
                                <div key={label} className="flex flex-col gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                                        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', className)}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                    </div>
                                    <p className="text-3xl font-black tabular-nums">{value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-5 dark:border-sira-border dark:bg-sira-bg-card">
                            <div className="relative max-w-md">
                                <Search className={cn('pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400', isRtl ? 'right-4' : 'left-4')} />
                                <input
                                    type="text"
                                    value={batchSearchCold}
                                    onChange={(e) => setBatchSearchCold(e.target.value)}
                                    placeholder={t('campaignsPage.searchBatches')}
                                    className={cn('h-12 w-full rounded-2xl border border-slate-200 bg-slate-50/80 text-sm font-bold outline-none dark:border-sira-border dark:bg-foreground/5 dark:text-foreground', isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4')}
                                />
                            </div>
                            {showBatchDeleteUi ? (
                                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-sira-border">
                                    <button
                                        type="button"
                                        onClick={selectAllVisibleBatches}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#0B1828] hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground dark:hover:bg-foreground/5"
                                    >
                                        {t('campaignsPage.selectAllVisible', { defaultValue: 'Select all' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearBatchSelection}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground/70 dark:hover:bg-foreground/5"
                                    >
                                        {t('campaignsPage.clearSelection', { defaultValue: 'Clear' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openDeleteModal}
                                        disabled={selectedCountOnTab === 0 || deletingBulk}
                                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                                    >
                                        {deletingBulk ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                        {t('campaignsPage.deleteSelectedBatches', {
                                            count: selectedCountOnTab,
                                            defaultValue: 'Delete selected ({{count}})',
                                        })}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {filteredColdBatches.length === 0 ? (
                            <p className="py-14 text-center text-slate-500">{t('campaignsPage.emptyColdBatches')}</p>
                        ) : (
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                                {filteredColdBatches.map((b: any) =>
                                    renderBatchCard(b, {
                                        showCheckbox: showBatchDeleteUi,
                                        checked: selectedBatchIds.includes(String(b.id)),
                                        onToggle: () => toggleBatchSelected(String(b.id)),
                                    }),
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <Modal
                isOpen={deleteModalOpen}
                onClose={closeDeleteModal}
                title={t('campaignsPage.deleteBatchesModalTitle', {
                    count: idsPendingDelete.length,
                    defaultValue: 'Delete {{count}} batch(es)?',
                })}
                subtitle={t('campaignsPage.deleteBatchesModalSubtitle', { defaultValue: 'CONFIRM DELETION' })}
                size="sm"
                headerIcon={<Trash2 className="h-7 w-7 text-red-600" aria-hidden />}
            >
                <div className="w-full space-y-5">
                    <p className="text-sm font-semibold leading-relaxed text-slate-700">
                        {t('campaignsPage.deleteBatchesModalBody', {
                            count: idsPendingDelete.length,
                            defaultValue:
                                'This will permanently delete the selected import batches and all CRM leads, meetings, and activity tied to them. This action cannot be undone.',
                        })}
                    </p>
                    <div className="modal-actions-stack border-0 pt-0">
                        <button
                            type="button"
                            onClick={() => void executeBulkDelete()}
                            disabled={deletingBulk || idsPendingDelete.length === 0}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-600 bg-red-600 px-5 py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/15 transition-all hover:bg-red-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {deletingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            {t('campaignsPage.deleteBatchesModalConfirm', { defaultValue: 'Delete permanently' })}
                        </button>
                        <button
                            type="button"
                            onClick={closeDeleteModal}
                            disabled={deletingBulk}
                            className="modal-cancel-link disabled:pointer-events-none disabled:opacity-50"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
