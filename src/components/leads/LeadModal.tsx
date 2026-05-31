import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Modal, { type ModalProps } from '../ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import {
    User,
    Phone,
    Mail,
    Search,
    FileText,
    UserPlus,
    Target,
    Loader2,
    Zap,
    Sparkles,
    Upload,
    FileSpreadsheet,
    BarChart3,
    AlertCircle,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import {
    getUsersByRole,
    createLead,
    updateLead,
    getAllCampaigns,
    getAllLeads,
    getUnits,
    createDataBatch,
    importDataBatch,
    deleteDataBatch,
} from '../../services/api';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import {
    parseFirstSheetBulkHeaders,
    guessBulkColumnMapping,
    type BulkImportSchemaField,
} from '../../lib/excelBulkHeaders';
import { canDeleteDataBatch } from '../../lib/userRole';

interface LeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    lead?: any;
}

/* const BULK_SOURCES = [
    { value: 'ads_platform', i18nKey: 'leadInjection.sourceAds', requiresCampaign: true },
    { value: 'cold_call_platform', i18nKey: 'leadInjection.sourceColdCall', requiresCampaign: false },
    { value: 'website_platform', i18nKey: 'leadInjection.sourceWebsite', requiresCampaign: false },
    { value: 'social_platform', i18nKey: 'leadInjection.sourceSocial', requiresCampaign: false },
    { value: 'assets_platform', i18nKey: 'leadInjection.sourceAssets', requiresCampaign: false },
] as const; */

const MANUAL_PLATFORM_OPTIONS = [
    { value: 'ads', labelKey: 'leadInjection.platformAds', leadType: 'campaign' as const },
    { value: 'dubizzle', labelKey: 'leadInjection.platformDubizzle', leadType: 'platform' as const },
    { value: 'bayut', labelKey: 'leadInjection.platformBayut', leadType: 'platform' as const },
    { value: 'aqarmap', labelKey: 'leadInjection.platformAqarmap', leadType: 'platform' as const },
    { value: 'property_finder_egypt', labelKey: 'leadInjection.platformPropertyFinderEgypt', leadType: 'platform' as const },
    { value: 'cold_call', labelKey: 'leadInjection.platformColdCall', leadType: 'cold_call' as const },
] as const;

/** Ads marketing branch: Project vs Resale — used in bulk Excel and manual injection. */
type BulkImportKind = 'project' | 'resale';

/** Matches backend leads.service validateAssignment(): OM → standard, Sales → customize. */
function deriveAssignmentModeFromAssignee(assignee?: { role?: { name?: string } } | null): 'standard' | 'customize' | undefined {
    const r = String(assignee?.role?.name ?? '').toLowerCase();
    if (r === 'operation_manager') return 'standard';
    if (r === 'sales') return 'customize';
    return undefined;
}

/** Open select menus below trigger (avoid Radix flipping upward in modals). */
const selectContentBelow = { side: 'bottom' as const, avoidCollisions: false };
export default function LeadModal({ isOpen, onClose, lead }: LeadModalProps) {
    const { t, i18n } = useTranslation();
    const isAdd = !lead;
    const [agentSearch, setAgentSearch] = useState('');
    const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
    const currentUser = useSelector((state: any) => state.user.user);
    const [users, setUsers] = useState<any[]>([]);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const [injectionMode, setInjectionMode] = useState<'manual' | 'bulk'>('manual');
    const [bulkBatchName, setBulkBatchName] = useState('');
    const [bulkFile, setBulkFile] = useState<File | null>(null);
    const [bulkImportKind, setBulkImportKind] = useState<BulkImportKind>('project');
    /** Lead source / channel on the right (Ads, portals, etc.). Resale marketing type uses Ads + Resale on the left. */
    const [bulkPlatform, setBulkPlatform] = useState<(typeof MANUAL_PLATFORM_OPTIONS)[number]['value']>('ads');
    const [bulkDragging, setBulkDragging] = useState(false);
    const bulkFileInputRef = useRef<HTMLInputElement>(null);
    const [bulkStep, setBulkStep] = useState<'form' | 'columns' | 'preview'>('form');
    const [bulkExcelHeaders, setBulkExcelHeaders] = useState<{ keys: string[]; labels: string[] } | null>(null);
    const [bulkColumnMapping, setBulkColumnMapping] = useState<Record<BulkImportSchemaField, string>>({
        phone: '',
        name: '',
        email: '',
        notes: '',
        priority: '',
    });
    const [bulkPreviewResult, setBulkPreviewResult] = useState<{
        total: number;
        imported: number;
        skipped: number;
        failed: number;
    } | null>(null);
    const [bulkPendingBatchId, setBulkPendingBatchId] = useState<string | null>(null);
    /** Empty batch left after dry-run preview — delete if user abandons without confirming import. */
    const bulkBatchIdPendingCleanup = useRef<string | null>(null);

    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        status: 'new_lead',
        leadType: 'campaign',
        notes: '',
        assignedTo: '',
        campaignId: '',
    });

    const [manualFullName, setManualFullName] = useState('');
    const [manualPlatform, setManualPlatform] =
        useState<(typeof MANUAL_PLATFORM_OPTIONS)[number]['value']>('ads');
    /** Ads / campaign manual injection only — Project vs Resale (matches bulk Excel). */
    const [manualImportKind, setManualImportKind] = useState<BulkImportKind>('project');
    const [unitCode, setUnitCode] = useState('');
    const [unitLookupBusy, setUnitLookupBusy] = useState(false);
    const [matchedUnitOwner, setMatchedUnitOwner] = useState<{
        code: string;
        createdBy: string;
        ownerName: string;
    } | null>(null);

    const [isDuplicate, setIsDuplicate] = useState(false);
    const [checkingPhone, setCheckingPhone] = useState(false);

    useEffect(() => {
        const checkDuplicate = async () => {
            if (!formData.phone || formData.phone.length < 8 || lead) {
                setIsDuplicate(false);
                return;
            }
            setCheckingPhone(true);
            try {
                const res = await getAllLeads(1, 1, { search: formData.phone });
                const exists = (res?.data?.length ?? 0) > 0;
                setIsDuplicate(exists);
            } catch (error) {
                console.error('Check duplicate error:', error);
            } finally {
                setCheckingPhone(false);
            }
        };

        const timer = setTimeout(checkDuplicate, 600);
        return () => clearTimeout(timer);
    }, [formData.phone, lead]);

    const roleName = typeof currentUser?.role === 'string' ? currentUser.role : (currentUser?.role?.name ?? '');

    useEffect(() => {
        if (!isOpen) return;
        if (!lead) {
            setInjectionMode('manual');
            setBulkBatchName('');
            setBulkFile(null);
            setBulkImportKind('project');
            setBulkPlatform('ads');
            setBulkDragging(false);
            setBulkStep('form');
            setBulkPreviewResult(null);
            setBulkPendingBatchId(null);
            bulkBatchIdPendingCleanup.current = null;
            setBulkExcelHeaders(null);
            setBulkColumnMapping({ phone: '', name: '', email: '', notes: '', priority: '' });
            setManualFullName('');
            setManualPlatform('ads');
            setManualImportKind('project');
            setUnitCode('');
            setMatchedUnitOwner(null);
            setUnitLookupBusy(false);
        }
    }, [isOpen, lead]);

    useEffect(() => {
        if (isOpen) return;
        const bid = bulkBatchIdPendingCleanup.current;
        bulkBatchIdPendingCleanup.current = null;
        if (bid && canDeleteDataBatch(currentUser)) {
            deleteDataBatch(bid).catch(() => {});
        }
    }, [isOpen, currentUser]);

    const applyManualFullName = useCallback((value: string) => {
        setManualFullName(value);
        const trimmed = value.trim();
        const sp = trimmed.indexOf(' ');
        if (sp === -1) {
            setFormData((prev) => ({ ...prev, firstName: trimmed, lastName: '' }));
        } else {
            setFormData((prev) => ({
                ...prev,
                firstName: trimmed.slice(0, sp).trim(),
                lastName: trimmed.slice(sp + 1).trim(),
            }));
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            if (lead) {
                setFormData({
                    firstName: lead.firstName || '',
                    lastName: lead.lastName || '',
                    phone: lead.phone || '',
                    email: lead.email || '',
                    status: lead.status || 'new_lead',
                    leadType: lead.type || 'campaign',
                    notes: lead.notes || '',
                    assignedTo: lead.assignedTo != null ? String(lead.assignedTo) : '',
                    campaignId: lead.campaignId ? String(lead.campaignId) : '',
                });
            } else {
                setFormData({
                    firstName: '',
                    lastName: '',
                    phone: '',
                    email: '',
                    status: 'new_lead',
                    leadType: 'campaign',
                    notes: '',
                    assignedTo: '',
                    campaignId: '',
                });
            }
        }
    }, [isOpen, lead]);

    useEffect(() => {
        if (isOpen) {
            getAllCampaigns()
                .then((res) => {
                    const list = Array.isArray(res) ? res : res?.data ?? [];
                    setCampaigns(list);
                })
                .catch(() => {});
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const rolesToFetch =
            roleName === 'super_admin'
                ? (['operation_manager', 'sales'] as const)
                : roleName === 'operation_manager'
                  ? (['sales'] as const)
                  : null;
        if (!rolesToFetch) {
            setUsers([]);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const lists = await Promise.all(rolesToFetch.map((r) => getUsersByRole(r)));
                if (cancelled) return;
                const merged: any[] = [];
                const seen = new Set<string>();
                for (const response of lists) {
                    const fetchedUsers = response?.data || response || [];
                    for (const u of fetchedUsers) {
                        const id = String(u.id);
                        if (!seen.has(id)) {
                            seen.add(id);
                            merged.push(u);
                        }
                    }
                }
                setUsers(merged);
            } catch (error) {
                console.error('Failed to fetch users:', error);
                if (!cancelled) setUsers([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, currentUser, roleName]);

    const canManualAssign = roleName === 'super_admin' || roleName === 'operation_manager';

    /** Unit code + lookup: Resale (ads) and listing portals — not Ads·Project (assignment without unit). */
    const showManualUnitCode =
        manualPlatform !== 'cold_call' && !(manualPlatform === 'ads' && manualImportKind === 'project');

    const getInboundForManualApi = () => {
        if (manualPlatform === 'ads' && manualImportKind === 'resale') return 'resale';
        if (manualPlatform === 'ads') return 'ads';
        if (manualPlatform === 'cold_call') return 'cold_call';
        return manualPlatform;
    };

    useEffect(() => {
        if (manualPlatform === 'ads' && manualImportKind === 'project') {
            setUnitCode('');
            setMatchedUnitOwner(null);
            setFormData((prev) => ({ ...prev, campaignId: '' }));
        }
    }, [manualPlatform, manualImportKind]);

    useEffect(() => {
        if (!isOpen || !isAdd || injectionMode !== 'manual' || !showManualUnitCode) return;
        const raw = unitCode.trim();
        if (!raw) {
            setMatchedUnitOwner(null);
            setUnitLookupBusy(false);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(async () => {
            setUnitLookupBusy(true);
            try {
                const rows = await getUnits({ q: raw });
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : rows?.data ?? [];
                const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
                const hit =
                    list.find((u: any) => norm(u?.code) === norm(raw)) ??
                    list.find((u: any) => norm(u?.code).includes(norm(raw))) ??
                    null;

                if (!hit?.createdBy) {
                    setMatchedUnitOwner(null);
                    return;
                }

                const ownerName = [hit?.creator?.firstName, hit?.creator?.lastName]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
                const ownerId = String(hit.createdBy);

                setMatchedUnitOwner({
                    code: String(hit.code ?? raw),
                    createdBy: ownerId,
                    ownerName: ownerName || t('leadInjection.unknownOwner'),
                });

                if (canManualAssign) {
                    // Keep assignment fully user-controlled in manual inject.
                    // Matching a unit owner should not auto-select assignee.
                }
            } catch {
                if (!cancelled) setMatchedUnitOwner(null);
            } finally {
                if (!cancelled) setUnitLookupBusy(false);
            }
        }, 450);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [unitCode, isOpen, isAdd, injectionMode, showManualUnitCode, canManualAssign, t]);

    const getFilteredUsers = () => {
        return [...users].sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));
    };

    const pickBulkFile = useCallback((file: File | undefined | null) => {
        if (!file) return;
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
            setBulkFile(file);
            setBulkStep('form');
            setBulkExcelHeaders(null);
            setBulkColumnMapping({ phone: '', name: '', email: '', notes: '', priority: '' });
        } else {
            toast.error(t('leadInjection.toastExcelOnly'));
        }
    }, [t]);

    const onBulkDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setBulkDragging(false);
            pickBulkFile(e.dataTransfer.files?.[0]);
        },
        [pickBulkFile],
    );

    const getInboundForBulkApi = () => {
        if (bulkPlatform === 'ads' && bulkImportKind === 'resale') return 'resale';
        return bulkPlatform === 'ads' ? 'ads' : bulkPlatform === 'cold_call' ? 'cold_call' : bulkPlatform;
    };

    const disposePreviewBatch = async () => {
        const id = bulkPendingBatchId;
        if (!id) return;
        bulkBatchIdPendingCleanup.current = null;
        setBulkPendingBatchId(null);
        if (!canDeleteDataBatch(currentUser)) return;
        try {
            await deleteDataBatch(id);
        } catch {
            /* batch may already be deleted or have leads after confirm */
        }
    };

    /** From import preview: discard dry-run batch and return to column mapping. */
    const handleBulkPreviewBack = async () => {
        await disposePreviewBatch();
        setBulkPreviewResult(null);
        setBulkPendingBatchId(null);
        bulkBatchIdPendingCleanup.current = null;
        setBulkStep('columns');
    };

    /** Leaving bulk injection (e.g. switch to manual tab): full reset. */
    const resetBulkInjectionUi = async () => {
        await disposePreviewBatch();
        setBulkPreviewResult(null);
        setBulkPendingBatchId(null);
        bulkBatchIdPendingCleanup.current = null;
        setBulkStep('form');
        setBulkExcelHeaders(null);
        setBulkColumnMapping({ phone: '', name: '', email: '', notes: '', priority: '' });
        setBulkImportKind('project');
        setBulkPlatform('ads');
    };

    const handleBulkColumnsBack = () => {
        setBulkStep('form');
    };

    const buildBulkMappingPayload = (): Record<string, string> | undefined => {
        const out: Record<string, string> = {};
        (['phone', 'name', 'email', 'notes', 'priority'] as const).forEach((f) => {
            const v = bulkColumnMapping[f]?.trim();
            if (v) out[f] = v;
        });
        return Object.keys(out).length ? out : undefined;
    };

    const goToBulkColumnMapping = async () => {
        const uid = currentUser?.id != null ? Number(currentUser.id) : NaN;
        if (!Number.isFinite(uid)) {
            toast.error(t('leadInjection.toastNotSignedIn'));
            return;
        }
        const name = bulkBatchName.trim();
        if (!name) {
            toast.error(t('leadInjection.toastBatchNameRequired'));
            return;
        }
        if (!bulkFile) {
            toast.error(t('leadInjection.toastFileRequired'));
            return;
        }
        setSubmitting(true);
        try {
            const { keys, labels } = await parseFirstSheetBulkHeaders(bulkFile);
            if (!keys.length) {
                toast.error(t('leadInjection.toastBulkHeadersEmpty'));
                return;
            }
            setBulkExcelHeaders({ keys, labels });
            setBulkColumnMapping(guessBulkColumnMapping(keys, labels));
            setBulkStep('columns');
        } catch (e) {
            console.error(e);
            toast.error(t('leadInjection.toastBulkHeadersFail'));
        } finally {
            setSubmitting(false);
        }
    };

    const runBulkPreview = async () => {
        const uid = currentUser?.id != null ? Number(currentUser.id) : NaN;
        if (!Number.isFinite(uid)) {
            toast.error(t('leadInjection.toastNotSignedIn'));
            return;
        }
        const name = bulkBatchName.trim();
        if (!name) {
            toast.error(t('leadInjection.toastBatchNameRequired'));
            return;
        }
        if (!bulkFile) {
            toast.error(t('leadInjection.toastFileRequired'));
            return;
        }
        if (!bulkColumnMapping.phone?.trim()) {
            toast.error(t('leadInjection.toastBulkMapPhoneRequired'));
            return;
        }
        setSubmitting(true);
        try {
            const batchPayload: Record<string, unknown> = {
                batchName: name,
                createdBy: uid,
                totalRecords: 0,
            };
            if (bulkPlatform === 'ads' && bulkImportKind === 'resale') {
                batchPayload.dataSource = 'resale';
            } else {
                batchPayload.dataSource = bulkPlatform;
            }
            const batchRes = await createDataBatch(batchPayload);
            const rawId = batchRes?.id ?? batchRes?.data?.id;
            if (rawId == null) {
                throw new Error('No batch id');
            }
            const batchId = typeof rawId === 'bigint' ? rawId.toString() : String(rawId);
            const inboundForApi = getInboundForBulkApi();
            const mappingPayload = buildBulkMappingPayload();
            const result = await importDataBatch(batchId, bulkFile, mappingPayload, true, {
                inboundPlatform: inboundForApi,
            });
            const total = (result as any)?.total ?? 0;
            const imported = (result as any)?.imported ?? 0;
            const skipped = (result as any)?.skipped ?? 0;
            const failed = (result as any)?.failed ?? 0;
            setBulkPreviewResult({ total, imported, skipped, failed });
            setBulkPendingBatchId(batchId);
            bulkBatchIdPendingCleanup.current = batchId;
            setBulkStep('preview');
        } catch (error: any) {
            console.error('Bulk preview:', error);
            const msg = error?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(' ') : msg || t('leadInjection.toastImportFail'));
        } finally {
            setSubmitting(false);
        }
    };

    const runBulkConfirmImport = async () => {
        if (!bulkPendingBatchId || !bulkFile) {
            toast.error(t('leadInjection.toastFileRequired'));
            return;
        }
        setSubmitting(true);
        try {
            const inboundForApi = getInboundForBulkApi();
            const mappingPayload = buildBulkMappingPayload();
            const result = await importDataBatch(bulkPendingBatchId, bulkFile, mappingPayload, false, {
                inboundPlatform: inboundForApi,
            });
            bulkBatchIdPendingCleanup.current = null;
            const imported = (result as any)?.imported ?? 0;
            const skipped = (result as any)?.skipped ?? 0;
            const failed = (result as any)?.failed ?? 0;
            let msg = t('leadInjection.toastImportDone', { imported, skipped, failed });
            if (bulkPlatform === 'ads') {
                msg +=
                    ' ' +
                    (bulkImportKind === 'resale'
                        ? t('leadInjection.toastImportBatchNoteResale')
                        : t('leadInjection.toastImportBatchNoteProject'));
            }
            toast.success(msg);
            setBulkPendingBatchId(null);
            setBulkPreviewResult(null);
            setBulkStep('form');
            setBulkExcelHeaders(null);
            setBulkColumnMapping({ phone: '', name: '', email: '', notes: '', priority: '' });
            onClose();
        } catch (error: any) {
            console.error('Bulk import:', error);
            const msg = error?.response?.data?.message;
            toast.error(Array.isArray(msg) ? msg.join(' ') : msg || t('leadInjection.toastImportFail'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lead && injectionMode === 'bulk' && bulkStep === 'form') {
            await goToBulkColumnMapping();
            return;
        }
        if (isDuplicate && !lead) {
            toast.warning(t('leadModal.phoneExistsWarning'));
        }
        setSubmitting(true);
        try {
            const { leadType, campaignId, assignedTo: _omitAssignForEdit, ...rest } = formData;
            const isAuto = formData.assignedTo === '__auto__';
            /** Manual: every channel (including cold_call and Ads·Project) may resolve assignee from the form. */
            const resolvedAssignTo =
                formData.assignedTo &&
                formData.assignedTo !== '__unassigned__' &&
                formData.assignedTo !== '__auto__'
                    ? Number(formData.assignedTo)
                    : undefined;
            const assigneeRow =
                resolvedAssignTo != null ? users.find((u) => Number(u.id) === resolvedAssignTo) : undefined;
            const assignmentMode = deriveAssignmentModeFromAssignee(assigneeRow ?? null);
            if (!lead && resolvedAssignTo != null && assignmentMode == null) {
                toast.error(t('leadModal.toastAssignRoleUnknown'));
                setSubmitting(false);
                return;
            }
            let nextNotes = rest.notes ?? '';
            if (!lead && injectionMode === 'manual') {
                const platformNoteLabel =
                    manualPlatform === 'ads'
                        ? manualImportKind === 'resale'
                            ? `${t('leadInjection.platformAds')} · ${t('leadInjection.bulkTypeResale')}`
                            : `${t('leadInjection.platformAds')} · ${t('leadInjection.bulkTypeProject')}`
                        : t(
                              MANUAL_PLATFORM_OPTIONS.find((p) => p.value === manualPlatform)?.labelKey ||
                                  'leadInjection.platformAds',
                          );
                const tags = [
                    t('leadInjection.notePlatformTag', {
                        platform: platformNoteLabel,
                    }),
                    showManualUnitCode && unitCode.trim()
                        ? t('leadInjection.noteUnitCodeTag', { code: unitCode.trim() })
                        : '',
                ]
                    .filter(Boolean)
                    .join(' | ');
                nextNotes = [tags, nextNotes].filter(Boolean).join('\n');
            }
            const basePayload = {
                ...rest,
                email: rest.email?.trim() ? rest.email.trim() : undefined,
                notes: nextNotes,
                type: leadType,
                campaignId:
                    leadType === 'campaign' &&
                    campaignId &&
                    campaignId !== '__none__' &&
                    manualPlatform !== 'ads'
                        ? Number(campaignId)
                        : undefined,
                ...(!lead && injectionMode === 'manual' ? { inboundPlatform: getInboundForManualApi() } : {}),
            };

            const payload = lead?.id
                ? basePayload
                : {
                      ...basePayload,
                      assignedTo: resolvedAssignTo,
                      ...(isAuto ? { autoAssign: true } : {}),
                      ...(resolvedAssignTo != null && assignmentMode ? { assignmentMode } : {}),
                  };

            if (lead?.id) {
                await updateLead(Number(lead.id), payload);
                toast.success(t('leadModal.toastUpdateSuccess'));
            } else {
                await createLead(payload);
                toast.success(t('leadModal.toastSaveSuccess'));
            }
            onClose();
        } catch (error: any) {
            console.error('Submitting lead:', error);
            toast.error(error.response?.data?.message || t('leadModal.toastSaveFail'));
        } finally {
            setSubmitting(false);
        }
    };

    const headerIcon =
        isAdd ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#0B1828]/40 bg-slate-50 text-[#0B1828] shadow-sm">
                <Zap className="h-6 w-6" aria-hidden />
            </div>
        ) : undefined;

    const modalTitle = isAdd ? t('leadInjection.title') : t('leadModal.titleEdit');
    const modalSubtitle = isAdd ? t('leadInjection.subtitle') : t('leadModal.subtitle', { defaultValue: 'LEAD RECORD' });
    const modalSize: NonNullable<ModalProps['size']> = isAdd ? '4xl' : 'xl';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={modalTitle}
            subtitle={modalSubtitle}
            headerIcon={headerIcon}
            size={modalSize}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                {isAdd ? (
                    <div className="flex justify-center bg-slate-50/40 py-4 dark:bg-foreground/5">
                        <div className="inline-flex rounded-2xl border border-slate-100 bg-white p-1 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                            <button
                                type="button"
                                onClick={() => {
                                    setInjectionMode('bulk');
                                }}
                                className={cn(
                                    'rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                    injectionMode === 'bulk'
                                        ? 'border border-[#0B1828] bg-[#0B1828] text-white shadow-lg'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-foreground/10',
                                )}
                            >
                                {t('leadInjection.tabBulk')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (injectionMode === 'bulk') {
                                        void resetBulkInjectionUi();
                                    }
                                    setInjectionMode('manual');
                                }}
                                className={cn(
                                    'rounded-xl px-6 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                    injectionMode === 'manual'
                                        ? 'border border-[#0B1828] bg-[#0B1828] text-white shadow-lg'
                                        : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-foreground/10',
                                )}
                            >
                                {t('leadInjection.tabManual')}
                            </button>
                        </div>
                    </div>
                ) : null}

                {isAdd && injectionMode === 'bulk' && bulkStep === 'columns' && bulkExcelHeaders ? (
                    <div className="space-y-5 text-start font-sans" dir={i18n.dir()}>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-sira-border dark:bg-foreground/5">
                            <h3 className="mb-1 flex items-center gap-2 text-sm font-black text-[#0B1828] dark:text-white">
                                <FileSpreadsheet className="h-4 w-4 shrink-0 text-[#BF9B30]" aria-hidden />
                                {t('leadInjection.bulkMapTitle')}
                            </h3>
                            <p className="text-[11px] font-bold leading-relaxed text-slate-600 dark:text-slate-400">
                                {t('leadInjection.bulkMapHint')}
                            </p>
                            {bulkFile ? (
                                <p className="mt-2 truncate text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    {bulkFile.name}
                                </p>
                            ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            {(['phone', 'name', 'email', 'notes', 'priority'] as const).map((field) => (
                                <div key={field} className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {t(`leadInjection.bulkMapField.${field}`)}
                                        {field === 'phone' ? (
                                            <span className="ms-1 text-rose-600">*</span>
                                        ) : null}
                                    </label>
                                    <Select
                                        value={bulkColumnMapping[field] ? bulkColumnMapping[field] : '__none__'}
                                        onValueChange={(v) =>
                                            setBulkColumnMapping((prev) => ({
                                                ...prev,
                                                [field]: v === '__none__' ? '' : v,
                                            }))
                                        }
                                    >
                                        <SelectTrigger className="modal-field-select rounded-2xl border-slate-200 bg-white text-xs font-bold">
                                            <SelectValue placeholder={t('leadInjection.bulkMapPickColumn')} />
                                        </SelectTrigger>
                                        <SelectContent {...selectContentBelow}>
                                            <SelectItem value="__none__">{t('leadInjection.bulkMapSkip')}</SelectItem>
                                            {bulkExcelHeaders.keys.map((key, idx) => {
                                                const label = bulkExcelHeaders.labels[idx] ?? key;
                                                const display =
                                                    label === key || key.startsWith('__col_')
                                                        ? label
                                                        : `${label} (${key})`;
                                                return (
                                                    <SelectItem key={`${field}-${key}-${idx}`} value={key}>
                                                        {display}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : isAdd && injectionMode === 'bulk' && bulkStep === 'preview' && bulkPreviewResult ? (
                    <div className="space-y-6 text-start font-sans" dir={i18n.dir()}>
                        <div className="flex flex-col items-center gap-2 py-2">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-[#0B1828] ring-1 ring-black/5 dark:bg-foreground/10 dark:text-white">
                                <BarChart3 className="h-7 w-7" aria-hidden />
                            </div>
                            <h3 className="text-base font-black text-[#0B1828] dark:text-white">
                                {t('campaignsPage.importPreview')}
                            </h3>
                            <p className="max-w-xl px-2 text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                {t('campaignsPage.previewDescription')}
                            </p>
                        </div>

                        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-slate-50/90 p-4 text-start dark:border-sira-border dark:bg-foreground/5">
                            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {t('leadInjection.bulkPreviewSummaryTitle')}
                            </p>
                            <dl className="space-y-2 text-[13px] font-bold text-[#0B1828] dark:text-white">
                                <div className="flex justify-between gap-4">
                                    <dt className="shrink-0 text-slate-500">{t('leadInjection.batchNameLabel')}</dt>
                                    <dd className="min-w-0 text-end break-words">{bulkBatchName.trim()}</dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="shrink-0 text-slate-500">{t('leadInjection.bulkPreviewSourceLabel')}</dt>
                                    <dd className="min-w-0 text-end">
                                        {t(
                                            MANUAL_PLATFORM_OPTIONS.find((p) => p.value === bulkPlatform)?.labelKey ??
                                                'leadInjection.platformAds',
                                        )}
                                    </dd>
                                </div>
                                {bulkPlatform === 'ads' ? (
                                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 dark:border-sira-border">
                                        <dt className="shrink-0 text-slate-500">{t('leadInjection.bulkMarketingTypeLabel')}</dt>
                                        <dd className="text-end font-black text-[#BF9B30]">
                                            {bulkImportKind === 'resale'
                                                ? t('leadInjection.bulkTypeResale')
                                                : t('leadInjection.bulkTypeProject')}
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center">
                                <p className="mb-1 text-[10px] font-black uppercase text-emerald-600/80">
                                    {t('campaignsPage.newLeads')}
                                </p>
                                <p className="text-2xl font-black text-emerald-600">{bulkPreviewResult.imported}</p>
                            </div>
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
                                <p className="mb-1 text-[10px] font-black uppercase text-amber-600/80">
                                    {t('campaignsPage.duplicates')}
                                </p>
                                <p className="text-2xl font-black text-amber-600">{bulkPreviewResult.skipped}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-center dark:border-sira-border dark:bg-foreground/5">
                                <p className="mb-1 text-[10px] font-black uppercase text-slate-400">
                                    {t('campaignsPage.totalFound')}
                                </p>
                                <p className="text-xl font-bold text-[#0B1828] dark:text-white">{bulkPreviewResult.total}</p>
                            </div>
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center">
                                <p className="mb-1 text-[10px] font-black uppercase text-red-600/80">
                                    {t('campaignsPage.errors')}
                                </p>
                                <p className="text-xl font-bold text-red-600">{bulkPreviewResult.failed}</p>
                            </div>
                        </div>

                        {bulkPreviewResult.skipped > 0 ? (
                            <div className="flex gap-3 rounded-r-2xl border-l-4 border-amber-500 bg-amber-500/5 p-4">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
                                        {t('campaignsPage.dupWarningTitle')}
                                    </p>
                                    <p className="text-[10px] leading-relaxed text-amber-700/90 dark:text-amber-300/90">
                                        {t('campaignsPage.dupWarningDesc')}
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : isAdd && injectionMode === 'bulk' ? (
                    <div
                        className="grid grid-cols-1 gap-10 text-start font-sans lg:grid-cols-2 lg:gap-14"
                        dir={i18n.dir()}
                    >
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadInjection.batchNameLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={bulkBatchName}
                                    onChange={(e) => setBulkBatchName(e.target.value)}
                                    placeholder={t('leadInjection.batchNamePlaceholder')}
                                    className="modal-input rounded-2xl border-slate-200/90 bg-slate-50/80 px-5 py-4 text-sm font-bold text-[#0B1828]"
                                />
                            </div>

                            {bulkPlatform === 'ads' ? (
                                <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <Target className="h-3.5 w-3.5 text-[#0B1828]" />
                                            {t('leadInjection.bulkMarketingTypeLabel')}
                                        </label>
                                        <Select
                                            value={bulkImportKind}
                                            onValueChange={(v) => setBulkImportKind(v as BulkImportKind)}
                                        >
                                            <SelectTrigger className="modal-field-select rounded-2xl border-slate-200 bg-white font-bold">
                                                <SelectValue placeholder={t('leadInjection.bulkMarketingTypeLabel')} />
                                            </SelectTrigger>
                                            <SelectContent {...selectContentBelow}>
                                                <SelectItem value="project">{t('leadInjection.bulkTypeProject')}</SelectItem>
                                                <SelectItem value="resale">{t('leadInjection.bulkTypeResale')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {bulkImportKind === 'resale' ? (
                                        <p className="text-[11px] font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                                            {t('leadInjection.bulkResaleSourceBody')}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            <input
                                ref={bulkFileInputRef}
                                type="file"
                                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                className="hidden"
                                onChange={(e) => {
                                    pickBulkFile(e.target.files?.[0]);
                                    e.target.value = '';
                                }}
                            />
                            <div
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') bulkFileInputRef.current?.click();
                                }}
                                onDragEnter={(e) => {
                                    e.preventDefault();
                                    setBulkDragging(true);
                                }}
                                onDragLeave={(e) => {
                                    e.preventDefault();
                                    setBulkDragging(false);
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={onBulkDrop}
                                onClick={() => bulkFileInputRef.current?.click()}
                                className={cn(
                                    'flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[2rem] border-4 border-dashed p-12 text-center transition-all',
                                    bulkDragging
                                        ? 'border-[#0B1828] bg-slate-50'
                                        : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 dark:border-sira-border dark:hover:bg-foreground/5',
                                )}
                            >
                                <Upload className="h-10 w-10 text-slate-300" aria-hidden />
                                <div>
                                    <p className="text-sm font-black text-[#0B1828] dark:text-white">
                                        {t('leadInjection.dropzone')}
                                    </p>
                                    {bulkFile ? (
                                        <p className="mt-2 flex items-center justify-center gap-2 text-[11px] font-bold text-emerald-700">
                                            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
                                            <span className="truncate">{bulkFile.name}</span>
                                        </p>
                                    ) : (
                                        <p className="mt-2 text-[10px] font-semibold text-slate-400">
                                            {t('leadInjection.bulkExcelHint')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="lg:border-s lg:border-slate-100 lg:ps-8 dark:lg:border-sira-border/60">
                            <h3 className="mb-6 border-s-4 border-[#0B1828] ps-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                                {t('leadInjection.chooseBulkSourceStep')}
                            </h3>
                            <div className="space-y-3">
                                {MANUAL_PLATFORM_OPTIONS.map((opt) => {
                                    const active = bulkPlatform === opt.value;
                                    const hintKey =
                                        opt.leadType === 'campaign'
                                            ? 'leadInjection.typeCampaignHint'
                                            : opt.leadType === 'platform'
                                              ? 'leadInjection.typePlatformHint'
                                              : 'leadInjection.typeColdHint';
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                setBulkPlatform(opt.value);
                                                if (opt.value !== 'ads') {
                                                    setBulkImportKind('project');
                                                }
                                            }}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-start transition-all',
                                                active
                                                    ? 'border-[#0B1828] bg-slate-50 shadow-sm dark:bg-foreground/5'
                                                    : 'border-slate-100 hover:border-slate-200 dark:border-sira-border',
                                            )}
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <p
                                                    className={cn(
                                                        'truncate text-xs font-black',
                                                        active ? 'text-[#0B1828] dark:text-white' : 'text-slate-400',
                                                    )}
                                                >
                                                    {t(opt.labelKey)}
                                                </p>
                                                <p className="text-[10px] font-semibold leading-relaxed text-slate-400">
                                                    {t(hintKey)}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'h-5 w-5 shrink-0 rounded-full border-4 transition-colors',
                                                    active
                                                        ? 'border-[#0B1828] bg-[#0B1828]'
                                                        : 'border-slate-200 bg-white dark:border-sira-border',
                                                )}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : isAdd && injectionMode === 'manual' ? (
                    <div
                        className="grid grid-cols-1 gap-10 text-start font-sans lg:grid-cols-2 lg:gap-14"
                        dir={i18n.dir()}
                    >
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadInjection.fullClientName')}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={manualFullName}
                                    onChange={(e) => applyManualFullName(e.target.value)}
                                    placeholder={t('leadInjection.fullClientNamePlaceholder')}
                                    className="modal-input rounded-2xl border-slate-200/90 bg-slate-50/80 px-5 py-4 text-sm font-bold text-[#0B1828] transition-all focus:border-[#0B1828]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadModal.phone')}
                                </label>
                                <div className="group relative">
                                    <Phone className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/25 transition-colors group-focus-within:text-[#0B1828]" />
                                    <input
                                        type="text"
                                        required
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className={cn(
                                            'modal-input rounded-2xl border-slate-200/90 bg-slate-50/80 ps-11 text-[#0B1828] font-bold transition-all focus:border-[#0B1828]',
                                            isDuplicate && 'border-amber-500 ring-2 ring-amber-500/10',
                                        )}
                                        placeholder="+20 1XX XXX XXXX"
                                    />
                                    {isDuplicate && (
                                        <p className="mt-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600">
                                            {t('leadModal.phoneExistsWarning')}
                                        </p>
                                    )}
                                    {checkingPhone ? (
                                        <div className="absolute end-4 top-1/2 -translate-y-1/2">
                                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {manualPlatform === 'ads' ? (
                                <div className="animate-in fade-in slide-in-from-top-1 space-y-3">
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <Target className="h-3.5 w-3.5 text-[#0B1828]" />
                                            {t('leadInjection.bulkMarketingTypeLabel')}
                                        </label>
                                        <Select
                                            value={manualImportKind}
                                            onValueChange={(v) => {
                                                const k = v as BulkImportKind;
                                                setManualImportKind(k);
                                                if (k === 'project') {
                                                    setUnitCode('');
                                                    setMatchedUnitOwner(null);
                                                    setAgentSearch('');
                                                }
                                                if (k === 'resale') {
                                                    setFormData((prev) => ({ ...prev, campaignId: '' }));
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="modal-field-select rounded-2xl border-slate-200 bg-white font-bold">
                                                <SelectValue placeholder={t('leadInjection.bulkMarketingTypeLabel')} />
                                            </SelectTrigger>
                                            <SelectContent {...selectContentBelow}>
                                                <SelectItem value="project">{t('leadInjection.bulkTypeProject')}</SelectItem>
                                                <SelectItem value="resale">{t('leadInjection.bulkTypeResale')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {manualImportKind === 'resale' ? (
                                        <p className="text-[11px] font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                                            {t('leadInjection.bulkResaleSourceBody')}
                                        </p>
                                    ) : (
                                        <p className="text-[11px] font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                                            {t('leadInjection.manualProjectUnitHiddenHint')}
                                        </p>
                                    )}
                                </div>
                            ) : null}

                            {showManualUnitCode ? (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {t('leadInjection.unitCode')}
                                    </label>
                                    <div className="group relative">
                                        <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/25 transition-colors group-focus-within:text-[#0B1828]" />
                                        <input
                                            type="text"
                                            value={unitCode}
                                            onChange={(e) => setUnitCode(e.target.value)}
                                            placeholder={t('leadInjection.unitCodePlaceholder')}
                                            className="modal-input rounded-2xl border-slate-200/90 bg-slate-50/80 ps-11 text-sm font-bold text-[#0B1828]"
                                        />
                                    </div>
                                    {unitLookupBusy ? (
                                        <p className="text-[10px] font-bold text-slate-400">
                                            {t('leadInjection.unitLookupChecking')}
                                        </p>
                                    ) : matchedUnitOwner ? (
                                        <p className="text-[10px] font-bold text-emerald-700">
                                            {t('leadInjection.unitOwnerDetected', {
                                                code: matchedUnitOwner.code,
                                                owner: matchedUnitOwner.ownerName,
                                            })}
                                        </p>
                                    ) : unitCode.trim() ? (
                                        <p className="text-[10px] font-bold text-amber-700">
                                            {t('leadInjection.unitOwnerNotFound')}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] font-bold text-slate-400">
                                            {t('leadInjection.unitCodeHint')}
                                        </p>
                                    )}
                                </div>
                            ) : null}

                            {formData.leadType === 'campaign' && manualPlatform !== 'ads' ? (
                                <div className="animate-in fade-in slide-in-from-top-1 space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <Target className="h-3.5 w-3.5 text-[#0B1828]" />
                                        {t('leads.marketingCampaign')}
                                    </label>
                                    <Select
                                        value={formData.campaignId}
                                        onValueChange={(v) => setFormData({ ...formData, campaignId: v })}
                                    >
                                        <SelectTrigger className="modal-field-select rounded-2xl border-slate-200 bg-white font-bold">
                                            <SelectValue placeholder={t('leads.allCampaigns')} />
                                        </SelectTrigger>
                                        <SelectContent {...selectContentBelow}>
                                            <SelectItem value="__none__">{t('leads.noCampaign')}</SelectItem>
                                            {campaigns.map((c) => (
                                                <SelectItem key={String(c.id)} value={String(c.id)}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : null}

                            {manualPlatform === 'ads' && manualImportKind === 'resale' ? (
                                <p className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-[11px] font-semibold leading-relaxed text-amber-950/90">
                                    {t('leadInjection.manualResaleNoCampaignHint')}
                                </p>
                            ) : null}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadModal.email')}
                                </label>
                                <div className="group relative">
                                    <Mail className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/25" />
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="modal-input rounded-2xl border-slate-200/90 bg-slate-50/80 ps-11 text-[#0B1828] font-bold"
                                        placeholder="mail@example.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[#0B1828]">
                                            <UserPlus className="h-5 w-5" />
                                        </div>
                                        <h3 className="text-xs font-black uppercase tracking-wider text-[#0B1828]">
                                            {t('leadModal.assignmentTitle')}
                                        </h3>
                                    </div>

                                    <div className="space-y-4">
                                        {matchedUnitOwner ? (
                                            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#0B1828]">
                                                {t('leadInjection.autoAssigningToOwner', {
                                                    owner: matchedUnitOwner.ownerName,
                                                })}
                                            </p>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, assignedTo: '__auto__' });
                                                    setAgentSearch(t('leadModal.autoAssignPlaceholder', { defaultValue: 'Auto Assign' }));
                                                }}
                                                className={cn(
                                                    "flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[10px] font-black uppercase tracking-widest transition-all",
                                                    formData.assignedTo === '__auto__'
                                                        ? "bg-emerald-500 border-emerald-600 text-white shadow-sm"
                                                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                                )}
                                            >
                                                <Sparkles className="h-3.5 w-3.5" />
                                                {t('leadModal.autoAssignBtn', { defaultValue: 'System Auto Assign' })}
                                            </button>
                                         )}

                                        <div className="relative">
                                            <User className="pointer-events-none absolute start-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-sira-text-muted" />
                                            {canManualAssign ? (
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={agentSearch}
                                                        onChange={(e) => {
                                                            setAgentSearch(e.target.value);
                                                            setFormData({ ...formData, assignedTo: '' });
                                                        }}
                                                        onFocus={() => setIsAgentDropdownOpen(true)}
                                                        onBlur={() => setTimeout(() => setIsAgentDropdownOpen(false), 200)}
                                                        placeholder={t('leadModal.selectUserSearch', { defaultValue: 'Search Agent...' })}
                                                        className="modal-input rounded-2xl ps-11 text-xs font-bold"
                                                    />
                                                    {isAgentDropdownOpen && (
                                                        <div className="absolute top-full mt-2 z-50 w-full max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, assignedTo: '__auto__' });
                                                                        setAgentSearch(t('leadModal.autoAssignPlaceholder', { defaultValue: 'Auto Assign' }));
                                                                        setIsAgentDropdownOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center px-3 py-2 text-left text-[11px] font-black text-emerald-600 hover:bg-emerald-50 transition-colors rounded-xl mb-1 border border-emerald-100"
                                                                >
                                                                    <Sparkles className="h-3.5 w-3.5 me-2" />
                                                                    {t('leadModal.autoAssignPlaceholder', { defaultValue: 'System Auto Assign' })}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, assignedTo: '__unassigned__' });
                                                                        setAgentSearch(t('leadModal.unassignedPlaceholder'));
                                                                        setIsAgentDropdownOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center px-3 py-2 text-left text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-colors rounded-xl"
                                                                >
                                                                    {t('leadModal.unassignedPlaceholder')}
                                                                </button>
                                                            {getFilteredUsers().filter((u: any) => 
                                                                (u.firstName || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
                                                                (u.lastName || '').toLowerCase().includes(agentSearch.toLowerCase())
                                                            ).map((u: any) => (
                                                                <button
                                                                    key={u.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setFormData({ ...formData, assignedTo: String(u.id) });
                                                                        setAgentSearch(`${u.firstName} ${u.lastName} (${u.role?.displayName || u.role?.name})`);
                                                                        setIsAgentDropdownOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center px-3 py-2 text-left text-[11px] font-bold text-[#0B1828] hover:bg-[#0B1828] hover:text-white rounded-xl transition-colors mt-1"
                                                                >
                                                                    {u.firstName} {u.lastName} ({u.role?.displayName || u.role?.name})
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {formData.assignedTo && formData.assignedTo !== '__unassigned__' && (
                                                        <div className="mt-2 text-[10px] font-bold text-emerald-600 px-2">
                                                            {t('common.selected', { defaultValue: 'Selected' })}: {agentSearch}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <Select
                                                    value={formData.assignedTo || undefined}
                                                    onValueChange={(v) => setFormData({ ...formData, assignedTo: v })}
                                                >
                                                    <SelectTrigger className="modal-field-select rounded-2xl ps-11 text-xs font-bold">
                                                        <SelectValue placeholder={t('leadModal.selectUserPlaceholder')} />
                                                    </SelectTrigger>
                                                    <SelectContent {...selectContentBelow}>
                                                            <SelectItem value="__auto__" className="font-black text-emerald-600">
                                                                {t('leadModal.autoAssignPlaceholder', { defaultValue: 'Auto Assign' })}
                                                            </SelectItem>
                                                            <SelectItem value="__unassigned__">
                                                                {t('leadModal.unassignedPlaceholder')}
                                                            </SelectItem>
                                                        {getFilteredUsers().map((u: any) => (
                                                            <SelectItem key={u.id} value={String(u.id)}>
                                                                {u.firstName} {u.lastName} (
                                                                {u.role?.displayName || u.role?.name})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                        <p className="text-[9px] font-bold italic text-foreground/30">
                                            {t('leadModal.assignmentUnifiedHint')}
                                        </p>
                                    </div>
                                </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadModal.notes')}
                                </label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="modal-textarea min-h-[96px] rounded-3xl border-slate-200/90 bg-slate-50/80 px-4 py-3 text-sm font-bold text-[#0B1828]"
                                    placeholder={t('leadModal.notesPlaceholder')}
                                    rows={4}
                                />
                            </div>
                        </div>

                        <div className="lg:border-s lg:border-slate-100 lg:ps-8">
                            <h3 className="mb-6 border-s-4 border-[#0B1828] ps-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
                                {t('leadInjection.choosePlatformStep')}
                            </h3>
                            <div className="space-y-3">
                                {MANUAL_PLATFORM_OPTIONS.map((opt) => {
                                    const active = manualPlatform === opt.value;
                                    const hintKey =
                                        opt.leadType === 'campaign'
                                            ? 'leadInjection.typeCampaignHint'
                                            : opt.leadType === 'platform'
                                              ? 'leadInjection.typePlatformHint'
                                              : 'leadInjection.typeColdHint';
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                                const nextAllowsUnitAssign = opt.value !== 'cold_call';
                                                setManualPlatform(opt.value);
                                                if (opt.value !== 'ads') {
                                                    setManualImportKind('project');
                                                }
                                                if (!nextAllowsUnitAssign) {
                                                    setUnitCode('');
                                                    setMatchedUnitOwner(null);
                                                }
                                                setFormData((prev) => ({
                                                    ...prev,
                                                    leadType: opt.leadType,
                                                    campaignId:
                                                        opt.leadType === 'campaign'
                                                            ? prev.campaignId
                                                            : '',
                                                }));
                                            }}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-4 rounded-2xl border-2 px-5 py-4 text-start transition-all',
                                                active
                                                    ? 'border-[#0B1828] bg-slate-50 shadow-sm'
                                                    : 'border-slate-100 hover:border-slate-200',
                                            )}
                                        >
                                            <div className="min-w-0 space-y-1">
                                                <p
                                                    className={cn(
                                                        'truncate text-xs font-black',
                                                        active ? 'text-[#0B1828]' : 'text-slate-400',
                                                    )}
                                                >
                                                    {t(opt.labelKey)}
                                                </p>
                                                <p className="text-[10px] font-semibold leading-relaxed text-slate-400">
                                                    {t(hintKey)}
                                                </p>
                                            </div>
                                            <span
                                                className={cn(
                                                    'h-5 w-5 shrink-0 rounded-full border-4 transition-colors',
                                                    active
                                                        ? 'border-[#0B1828] bg-[#0B1828]'
                                                        : 'border-slate-200 bg-white',
                                                )}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : lead ? (
                    <>
                        <div className="space-y-2">
                            <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                {t('leadModal.leadType')}
                            </label>
                            <Select
                                value={formData.leadType}
                                onValueChange={(v) => setFormData({ ...formData, leadType: v, campaignId: '' })}
                            >
                                <SelectTrigger className="modal-field-select rounded-2xl border-slate-200/90 bg-white text-[#0B1828] font-bold hover:bg-[#0B1828] hover:text-white transition-all group">
                                    <SelectValue placeholder={t('leadModal.leadType')} />
                                </SelectTrigger>
                                <SelectContent {...selectContentBelow}>
                                    <SelectItem value="campaign">{t('leads.campaign')}</SelectItem>
                                    <SelectItem value="platform">{t('leads.platform')}</SelectItem>
                                    <SelectItem value="cold_call">{t('leadModal.coldCallData')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.leadType === 'campaign' && (
                            <div className="animate-in fade-in slide-in-from-top-2 space-y-2">
                                <label className="flex items-center gap-2 px-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                    <Target className="h-3 w-3 text-[#0B1828]" /> {t('leads.marketingCampaign')}
                                </label>
                                <Select
                                    value={formData.campaignId}
                                    onValueChange={(v) => setFormData({ ...formData, campaignId: v })}
                                >
                                    <SelectTrigger className="modal-field-select rounded-2xl border-slate-200 bg-white text-[#0B1828] font-bold hover:bg-[#0B1828] hover:text-white transition-all group">
                                        <SelectValue placeholder={t('leads.allCampaigns')} />
                                    </SelectTrigger>
                                    <SelectContent {...selectContentBelow}>
                                        <SelectItem value="__none__" className="font-bold italic text-slate-500">
                                            {t('leads.noCampaign')}
                                        </SelectItem>
                                        {campaigns.map((c) => (
                                            <SelectItem key={String(c.id)} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                    {t('leadModal.firstName')}
                                </label>
                                <div className="group relative">
                                    <User className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/20 transition-colors group-focus-within:text-[#0B1828]" />
                                    <input
                                        required
                                        type="text"
                                        value={formData.firstName}
                                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                        className="modal-input rounded-2xl border-slate-200/90 bg-white ps-11 text-[#0B1828] font-bold transition-all focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10"
                                        placeholder={t('leadModal.firstName')}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                    {t('leadModal.lastName')}
                                </label>
                                <div className="group relative">
                                    <User className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/20 transition-colors group-focus-within:text-[#0B1828]" />
                                    <input
                                        required
                                        type="text"
                                        value={formData.lastName}
                                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                        className="modal-input rounded-2xl border-slate-200/90 bg-white ps-11 text-[#0B1828] font-bold transition-all focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10"
                                        placeholder={t('leadModal.lastName')}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                {t('leadModal.phone')}
                            </label>
                            <div className="group relative">
                                <Phone className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/20 transition-colors group-focus-within:text-[#0B1828]" />
                                <input
                                    type="text"
                                    required
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className={cn(
                                        'modal-input rounded-2xl border-slate-200/90 bg-white ps-11 text-[#0B1828] font-bold transition-all focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10',
                                        isDuplicate && 'border-amber-500 ring-2 ring-amber-500/10',
                                    )}
                                    placeholder="+20 1XX XXX XXXX"
                                />
                                {isDuplicate && !lead && (
                                    <p className="mt-1.5 px-1 text-[10px] font-black uppercase tracking-widest text-amber-600 animate-pulse">
                                        {t('leadModal.phoneExistsWarning')}
                                    </p>
                                )}
                                {checkingPhone && (
                                    <div className="absolute end-4 top-1/2 -translate-y-1/2">
                                        <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                {t('leadModal.email')}
                            </label>
                            <div className="group relative">
                                <Mail className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#0B1828]/20 transition-colors group-focus-within:text-[#0B1828]" />
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="modal-input rounded-2xl border-slate-200/90 bg-white ps-11 text-[#0B1828] font-bold transition-all focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10"
                                    placeholder="mail@example.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-4 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="mb-2 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-[#0B1828]">
                                    <UserPlus className="h-5 w-5" />
                                </div>
                                <h3 className="text-sm font-black uppercase tracking-wider">{t('leadModal.assignmentTitle')}</h3>
                            </div>

                            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                                <p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    {t('leadModal.assignTo')}
                                </p>
                                <p className="px-1 text-sm font-black text-[#0B1828]">
                                    {lead?.assignedUser
                                        ? [lead.assignedUser.firstName, lead.assignedUser.lastName]
                                              .filter(Boolean)
                                              .join(' ')
                                              .trim() ||
                                          t('leadModal.unassignedPlaceholder')
                                        : t('leadModal.unassignedPlaceholder')}
                                </p>
                                <p className="px-1 text-[9px] font-bold leading-relaxed text-slate-500">
                                    {t('leadModal.editAssignHint')}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="px-1 text-[12px] font-black uppercase tracking-widest text-slate-600">
                                {t('leadModal.notes')}
                            </label>
                            <div className="group relative">
                                <FileText className="absolute start-4 top-4 h-4 w-4 text-[#0B1828]/20 transition-colors group-focus-within:text-[#0B1828]" />
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="modal-textarea min-h-[100px] resize-none rounded-3xl border-slate-200/90 bg-white pb-4 ps-11 pe-4 pt-4 text-sm font-bold text-[#0B1828] transition-all focus:border-[#0B1828] focus:ring-2 focus:ring-[#0B1828]/10"
                                    placeholder={t('leadModal.notesPlaceholder')}
                                />
                            </div>
                        </div>
                    </>
                ) : null}

                <div className="modal-actions-stack border-t border-slate-200/90 pt-6">
                    {isAdd && injectionMode === 'bulk' && bulkStep === 'preview' && bulkPreviewResult ? (
                        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => void handleBulkPreviewBack()}
                                className="modal-btn-secondary order-2 flex-1 text-[11px] uppercase tracking-widest sm:order-1"
                            >
                                {t('campaignsPage.back')}
                            </button>
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => void runBulkConfirmImport()}
                                className="modal-btn-primary order-1 flex-1 text-[11px] uppercase tracking-widest sm:order-2"
                            >
                                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                                {t('campaignsPage.confirmFinalImport')}
                            </button>
                        </div>
                    ) : isAdd && injectionMode === 'bulk' && bulkStep === 'columns' ? (
                        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={handleBulkColumnsBack}
                                className="modal-btn-secondary flex-1 text-[11px] uppercase tracking-widest"
                            >
                                {t('leadInjection.bulkMapBack')}
                            </button>
                            <button
                                type="button"
                                disabled={submitting || !bulkColumnMapping.phone?.trim()}
                                onClick={() => void runBulkPreview()}
                                className="modal-btn-primary flex-1 text-[11px] uppercase tracking-widest"
                            >
                                {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                                {t('leadInjection.bulkMapRunPreview')}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="submit"
                            disabled={submitting}
                            className="modal-btn-primary text-[11px] uppercase tracking-widest"
                        >
                            {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
                            {isAdd && injectionMode === 'bulk'
                                ? t('leadInjection.bulkMapNext')
                                : isAdd && injectionMode === 'manual'
                                  ? t('leadInjection.submitManual')
                                  : lead
                                    ? t('leadModal.updateSave')
                                    : t('leadModal.createLead')}
                        </button>
                    )}
                    <button type="button" onClick={onClose} className="modal-cancel-link text-[11px] uppercase tracking-widest">
                        {t('leadModal.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
