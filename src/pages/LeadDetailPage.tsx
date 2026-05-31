import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    ArrowLeft,
    Phone,
    FileText,
    Calendar,
    MessageSquare,
    MessageCircle,
    Loader2,
    UserPlus,
    Copy,
    Zap,
    Clock,
    RotateCcw,
    TrendingUp,
    PhoneCall,
    AlertCircle,
    User,
} from 'lucide-react';
import { getLeadById, createLeadFeedback, updateLead } from '../services/api';
import { toast } from '../lib/toast';
import { ScheduleMeetingMiniModal, AddFeedbackModal } from '../components/leads/LeadDetailMiniModals';
import BulkAssignModal from '../components/leads/BulkAssignModal';
import Modal from '../components/ui/Modal';
import { SiraTabs } from '../components/leads/SiraTabs';
import { PersonnelNameLink } from '../components/leads/PersonnelNameLink';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { FEEDBACK_GRID_ORDER, feedbackTileClasses, resolveFeedbackGridTile } from '../lib/leadFeedbackGrid';
import { formatPhoneWithCountryCode, getPhoneDigits } from '../utils/phone';
import PhoneLookupButton from '../components/leads/PhoneLookupButton';
import { translateLeadStatus } from '../lib/leadStatusLabel';

/** Re-export for modules that previously imported from this page. */
export { FEEDBACK_GRID_ORDER };

function leadSourceLine(lead: any, t: (k: string, o?: Record<string, unknown>) => string): string {
    if (lead?.campaign?.name) {
        const plat = lead.campaign.platformLabel || lead.campaign.platform || '';
        return plat ? `${lead.campaign.name} · ${plat}` : String(lead.campaign.name);
    }
    if (lead?.type) {
        const key = `leads.${lead.type}`;
        const tr = t(key);
        return tr !== key ? tr : String(lead.type).replace(/_/g, ' ');
    }
    return '—';
}

function ProfileStatusStrip({ status }: { status: string }) {
    const { t } = useTranslation();
    const s = String(status || '').toLowerCase();
    const label = translateLeadStatus(t, s);
    if (s === 'new_lead') {
        return (
            <span className="inline-flex rounded-full bg-[#0066FF] px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-600/25">
                {label}
            </span>
        );
    }
    return (
        <span className="inline-flex rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.2em] text-white/95 ring-1 ring-white/10">
            {label}
        </span>
    );
}

// --- Local Layout Components ---

const PageWrapper = ({ children, className, dir }: { children: ReactNode; className?: string; dir?: string }) => (
    <div dir={dir} className={cn("p-2 md:p-4 space-y-4 transition-all duration-150", className)}>
        {children}
    </div>
);

const Card = ({ children, title, className, id }: { children: ReactNode; title?: string; className?: string; id?: string }) => (
    <div id={id} className={cn("bg-white dark:bg-sira-bg-card rounded-2xl border border-slate-100 dark:border-sira-border shadow-sm p-5 transition-all", className)}>
        {title && <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{title}</h3>}
        {children}
    </div>
);

// --- Helper Functions ---


function formatDt(v: string | number | null | undefined, t: any) {
    if (v === null || v === undefined || v === '') return t('common.notExist') || 'not exist';
    const d = typeof v === 'number' ? new Date(v) : new Date(v);
    if (Number.isNaN(d.getTime())) return t('common.notExist') || 'not exist';
    return d.toLocaleString();
}

/** Timeline items store `at` as milliseconds — never pass `at.toString()` into `new Date()`. */
function formatTimelineMs(at: number) {
    if (!at || !Number.isFinite(at)) return '—';
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
}

function labelFromEnum(s: string | undefined, t?: any) {
    if (!s) return '—';
    if (t) return translateLeadStatus(t, s);
    return s.replace(/_/g, ' ');
}


function meetingStatusClass(status: string) {
    const s = String(status || '');
    if (s === 'completed') return 'bg-emerald-50 text-emerald-600';
    if (s === 'in_progress') return 'bg-blue-50 text-blue-600';
    if (s === 'scheduled') return 'bg-amber-50 text-amber-600';
    if (s === 'no_show') return 'bg-red-50 text-red-600';
    return 'bg-slate-50 text-slate-500';
}

/** Compare user ids from API (number, string, bigint-serialized). */
function sameActorId(a: unknown, b: unknown): boolean {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

type ActivityTimelineOpts = {
    /** When set (e.g. sales role), only include rows where this user is assignee, assigner, scheduler, or feedback author. */
    restrictToUserId?: string | null;
};

function buildActivityTimeline(leadData: any, t: any, opts?: ActivityTimelineOpts) {
    const uid = opts?.restrictToUserId?.trim() || null;
    const items: { at: number; label: string; detail: ReactNode; type: 'assignment' | 'system' | 'meeting' | 'feedback'; icon: ReactNode }[] = [];
    let hasRotationEvent = false;
    for (const a of leadData?.assignments ?? []) {
        if (uid) {
            const iAmAssignee = sameActorId(a.assignedUser?.id, uid) || sameActorId(a.assignedTo, uid);
            const iAmAssigner = sameActorId(a.assigner?.id, uid) || sameActorId(a.assignedBy, uid);
            if (!iAmAssignee && !iAmAssigner) continue;
        }
        const at = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        const isRotationEvent = String(a.assignmentType || '').toLowerCase() === 'rotation';
        if (isRotationEvent) hasRotationEvent = true;
        items.push({
            at,
            type: 'assignment',
            label: isRotationEvent ? t('leadDetail.timeline.rotation') : t('leadDetail.timeline.assignment'),
            detail: isRotationEvent
                ? (
                    <>
                        {t('leads.to')} <span className="mx-1">{t('leadDetail.unassigned')}</span>
                        {a.assigner && (
                            <>
                                <span className="mx-1">·</span>
                                <span>{t('common.by', { defaultValue: 'By' })}</span>
                                <PersonnelNameLink user={a.assigner} className="hover:text-sira-gold transition-colors font-black text-sira-brown mx-1" />
                            </>
                        )}
                    </>
                )
                : <>{t('leads.to')} <PersonnelNameLink user={a.assignedUser} className="hover:text-sira-gold transition-colors font-black text-sira-brown mx-1" /></>,
            icon: <UserPlus className="w-4 h-4 text-sira-gold" />
        });
    }
    if (leadData?.rotatedAt && !hasRotationEvent) {
        const at = new Date(leadData.rotatedAt).getTime();
        items.push({
            at,
            type: 'system',
            label: t('leadDetail.timeline.rotation'),
            detail: t('leadDetail.timeline.rotatedAndUnassigned'),
            icon: <Zap className="w-4 h-4 text-amber-500" />,
        });
    }
    for (const m of leadData?.meetings ?? []) {
        if (uid) {
            const iScheduled = sameActorId(m.scheduler?.id, uid) || sameActorId(m.scheduledBy, uid);
            if (!iScheduled) continue;
        }
        const at = (m.meetingDate && new Date(m.meetingDate).getTime()) || 0;
        items.push({
            at,
            type: 'meeting',
            label: t('leadDetail.timeline.meeting'),
            detail: (
                <>
                    {labelFromEnum(m.meetingType, t)}
                    {m.scheduler && (
                        <>
                            <span className="mx-1">·</span>
                            <span>{t('common.by', { defaultValue: 'By' })}</span>
                            <PersonnelNameLink user={m.scheduler} className="hover:text-sira-gold transition-colors font-black text-sira-brown mx-1" />
                        </>
                    )}
                </>
            ),
            icon: <Calendar className="w-4 h-4 text-sira-green" />
        });
    }
    for (const f of leadData?.feedbacks ?? []) {
        if (uid && !sameActorId(f.user?.id, uid)) continue;
        const at = f.createdAt ? new Date(f.createdAt).getTime() : 0;
        const typeLabel = labelFromEnum(f.feedbackType, t);
        const note = f.description != null ? String(f.description).trim() : '';
        
        items.push({
            at,
            type: 'feedback',
            label: t('leadDetail.timeline.feedback'),
            detail: (
                <>
                    {typeLabel}
                    {f.user && (
                        <>
                            <span className="mx-1">·</span>
                            <span>{t('common.by', { defaultValue: 'By' })}</span>
                            <PersonnelNameLink user={f.user} className="hover:text-sira-gold transition-colors font-black text-sira-brown mx-1" />
                        </>
                    )}
                    {note && ` — ${note}`}
                </>
            ),
            icon: f.feedbackType === 'note' ? <FileText className="w-4 h-4 text-sira-brown" /> : <MessageSquare className="w-4 h-4 text-sira-green" />
        });
    }
    return items.sort((x, y) => y.at - x.at);
}

function computeAssignmentCountdown(leadData: any, t: any) {
    const expiresAt = leadData?.assignments?.[0]?.assignmentExpiresAt;
    if (!expiresAt) return null;
    const end = new Date(expiresAt).getTime();
    if (!Number.isFinite(end)) return null;
    const msLeft = end - Date.now();
    if (msLeft <= 0) return t('leadDetail.assignmentExpired', { defaultValue: 'Follow-up window expired' });
    const minsTotal = Math.ceil(msLeft / 60_000);
    const hours = Math.floor(minsTotal / 60);
    const mins = minsTotal % 60;
    return hours > 0
        ? t('leadDetail.timeRemainingHoursMinutes', { hours, mins, defaultValue: `${hours}س ${mins}د متبقية` })
        : t('leadDetail.timeRemainingMinutes', { count: minsTotal, defaultValue: `متبقي ${minsTotal} دقيقة` });
}

    /* function maskLeadPhone(raw: string | null | undefined) {
        const value = String(raw || '').trim();
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (!digits) return '';
        if (digits.length <= 2) return '*'.repeat(digits.length);
        if (digits.length <= 5) return `${digits.slice(0, 1)}${'*'.repeat(digits.length - 2)}${digits.slice(-1)}`;
        return `${digits.slice(0, 3)}${'*'.repeat(Math.max(1, digits.length - 5))}${digits.slice(-2)}`;
    } */

// --- Main Page Component ---

export default function LeadDetailPage() {
    const { t, i18n } = useTranslation();
    const pageDir = i18n.dir();
    const isRtl = pageDir === 'rtl';
    const { leadId } = useParams<{ leadId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = useSelector((state: any) => state.user.user);
    const currentRoleName =
        typeof currentUser?.role === 'string'
            ? String(currentUser.role).toLowerCase()
            : String(currentUser?.role?.name || '').toLowerCase();
    const isSalesViewer = currentRoleName === 'sales';
    const isTechLead   = currentRoleName === 'tech_lead';
    const isManagerViewer = ['super_admin', 'operation_manager', 'sales_manager'].includes(currentRoleName);
    const canViewLeadSource = currentRoleName === 'super_admin' || currentRoleName === 'operation_manager';
    const salesViewerId = currentUser?.id != null ? String(currentUser.id) : null;
    const feedbackStatusOptions = FEEDBACK_GRID_ORDER;

    const [lead, setLead] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('assignments');
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [transferOpen, setTransferOpen] = useState(false);
    const [selectedFeedbackStatus, setSelectedFeedbackStatus] = useState<string>('new_lead');
    const [updateFeedbackNotes, setUpdateFeedbackNotes] = useState('');
    const [isSavingFeedback, setIsSavingFeedback] = useState(false);
    const [showMeetingPrompt, setShowMeetingPrompt] = useState(false);

    // These depend on `lead` state — must be after useState declarations
    const isLeadAssignedToMe = lead?.assignedTo != null && String(lead.assignedTo) === String(currentUser?.id);
    const showFeedbackForm = isSalesViewer || (isTechLead && isLeadAssignedToMe);
    const showManagerReport = isManagerViewer || (isTechLead && !isLeadAssignedToMe);

    const load = () => {
        const n = leadId ? Number(leadId) : NaN;
        if (!Number.isFinite(n)) return;
        setLoading(true);
        getLeadById(n)
            .then(setLead)
            .catch(() => toast.error(t('leadDetail.failedToLoadLead')))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, [leadId]);

    useEffect(() => {
        if (lead?.status) setSelectedFeedbackStatus(String(lead.status));
    }, [lead?.id, lead?.status]);

    const timeline = useMemo(
        () =>
            lead
                ? buildActivityTimeline(lead, t, isSalesViewer && salesViewerId ? { restrictToUserId: salesViewerId } : undefined)
                : [],
        [lead, t, isSalesViewer, salesViewerId],
    );

    const salesScopedAssignments = useMemo(() => {
        const rows = lead?.assignments ?? [];
        if (!isSalesViewer || !salesViewerId) return rows;
        return rows.filter(
            (a: any) =>
                sameActorId(a.assignedUser?.id, salesViewerId) ||
                sameActorId(a.assignedTo, salesViewerId) ||
                sameActorId(a.assigner?.id, salesViewerId) ||
                sameActorId(a.assignedBy, salesViewerId),
        );
    }, [lead?.assignments, isSalesViewer, salesViewerId]);
    const assignmentRows = useMemo(() => {
        const rows = [...salesScopedAssignments];
        const hasRotationRow = rows.some((a: any) => String(a.assignmentType || '').toLowerCase() === 'rotation');
        if (!hasRotationRow && lead?.rotatedAt) {
            rows.unshift({
                id: `rotation-fallback-${String(lead?.id ?? '')}-${String(lead?.rotatedAt ?? '')}`,
                assignedAt: lead.rotatedAt,
                assignedUser: null,
                assigner: null,
                assignmentType: 'rotation',
            });
        }
        return rows;
    }, [salesScopedAssignments, lead?.id, lead?.rotatedAt]);

    const salesScopedMeetings = useMemo(() => {
        const rows = lead?.meetings ?? [];
        if (!isSalesViewer || !salesViewerId) return rows;
        return rows.filter(
            (m: any) => sameActorId(m.scheduler?.id, salesViewerId) || sameActorId(m.scheduledBy, salesViewerId),
        );
    }, [lead?.meetings, isSalesViewer, salesViewerId]);

    const salesScopedFeedbacks = useMemo(() => {
        const rows = lead?.feedbacks ?? [];
        if (!isSalesViewer || !salesViewerId) return rows;
        return rows.filter((f: any) => sameActorId(f.user?.id, salesViewerId));
    }, [lead?.feedbacks, isSalesViewer, salesViewerId]);

    const handleSaveInlineFeedback = async (openPromptAfterSave = true) => {
        if (!lead?.id || currentUser?.id == null) return;
        if (!updateFeedbackNotes.trim()) {
            toast.error(t('leadDetail.modals.descRequired', { defaultValue: 'Please enter a description' }));
            return;
        }
        setIsSavingFeedback(true);
        try {
            await Promise.all([
                updateLead(lead.id, { status: selectedFeedbackStatus }),
                createLeadFeedback({
                    leadId: Number(lead.id),
                    userId: Number(currentUser.id),
                    feedbackType: selectedFeedbackStatus,
                    description: updateFeedbackNotes.trim(),
                }),
            ]);
            toast.success(t('leadDetail.feedbackAdded', { defaultValue: 'Update saved' }));
            setUpdateFeedbackNotes('');
            if (openPromptAfterSave) setShowMeetingPrompt(true);
            load();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('leadDetail.modals.failedFeedback', { defaultValue: 'Failed to save' }));
        } finally {
            setIsSavingFeedback(false);
        }
    };
    const assignmentCountdownText = computeAssignmentCountdown(lead, t);

    // ── Manager / Tech-Lead read-only report panel ──────────────────────────
    const latestFeedback = lead?.feedbacks?.[0] ?? null;
    const managerReportPanel = (
        <div className="space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { icon: <UserPlus className="w-4 h-4" />, label: 'تحويلات', value: lead?.assignments?.length ?? 0, color: 'text-blue-600 bg-blue-50' },
                    { icon: <MessageSquare className="w-4 h-4" />, label: 'فيدباك', value: lead?.feedbacks?.length ?? 0, color: 'text-emerald-600 bg-emerald-50' },
                    { icon: <PhoneCall className="w-4 h-4" />, label: 'مكالمات', value: lead?.callLogs?.length ?? 0, color: 'text-amber-600 bg-amber-50' },
                    { icon: <Calendar className="w-4 h-4" />, label: 'اجتماعات', value: lead?.meetings?.length ?? 0, color: 'text-violet-600 bg-violet-50' },
                ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex items-center gap-3 dark:border-sira-border dark:bg-sira-bg-card">
                        <div className={`rounded-xl p-2 ${s.color}`}>{s.icon}</div>
                        <div>
                            <p className="text-xl font-black text-[#0B1828] dark:text-foreground">{s.value}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Current assignment */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <User className="w-3.5 h-3.5" /> التعيين الحالي
                </h3>
                {lead?.assignedUser ? (
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-[#0B1828] flex items-center justify-center text-white text-sm font-black">
                                {String(lead.assignedUser.firstName?.[0] ?? '?')}
                            </div>
                            <div>
                                <PersonnelNameLink user={lead.assignedUser} className="font-black text-[#0B1828] dark:text-foreground text-[14px]" />
                                <p className="text-[11px] font-bold text-slate-400 capitalize">
                                    {lead.assignedUser.role?.name?.replace(/_/g, ' ') ?? ''}
                                </p>
                            </div>
                        </div>
                        {lead.assignedAt && (
                            <span className="rounded-xl bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500 dark:bg-foreground/5 dark:text-slate-300">
                                {new Date(lead.assignedAt).toLocaleDateString('ar-EG')}
                            </span>
                        )}
                    </div>
                ) : (
                    <p className="text-[12px] font-bold text-slate-400">غير معين حالياً — في قائمة الانتظار</p>
                )}
            </div>

            {/* Latest feedback */}
            {latestFeedback && (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                    <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5" /> آخر فيدباك
                    </h3>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            {translateLeadStatus(t, latestFeedback.feedbackType)}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                            {latestFeedback.user && (
                                <PersonnelNameLink user={latestFeedback.user} className="text-sira-brown font-black hover:text-sira-gold" />
                            )}
                            <span>·</span>
                            <span>{new Date(latestFeedback.createdAt).toLocaleString('ar-EG')}</span>
                        </div>
                    </div>
                    <p className="text-[12px] font-bold text-[#0B1828] dark:text-foreground whitespace-pre-wrap">
                        {latestFeedback.description}
                    </p>
                    {latestFeedback.nextActionDate && (
                        <p className="mt-2 text-[11px] font-bold text-amber-600 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            الخطوة التالية: {latestFeedback.nextAction ?? '—'} · {new Date(latestFeedback.nextActionDate).toLocaleDateString('ar-EG')}
                        </p>
                    )}
                </div>
            )}

            {/* Auto-retraction log */}
            {(lead?.autoRetractions?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                    <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 flex items-center gap-2">
                        <RotateCcw className="w-3.5 h-3.5" /> سجل السحب التلقائي
                    </h3>
                    <div className="space-y-2">
                        {lead.autoRetractions.map((r: any) => (
                            <div key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] dark:bg-foreground/5">
                                <div className="flex items-center gap-2 flex-wrap font-bold text-slate-700 dark:text-slate-200">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span>سُحب من</span>
                                    <PersonnelNameLink user={r.previousUser} className="font-black text-rose-600" />
                                    {r.reassignedUser && (
                                        <>
                                            <span>← أُعيد لـ</span>
                                            <PersonnelNameLink user={r.reassignedUser} className="font-black text-sira-brown" />
                                        </>
                                    )}
                                    {r.reason && <span className="text-slate-400">· {r.reason}</span>}
                                </div>
                                <span className="text-slate-400 shrink-0">{new Date(r.retractedAt).toLocaleDateString('ar-EG')}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Assignment history */}
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                <h3 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5" /> سجل التحويلات الكامل
                </h3>
                {assignmentRows.length === 0 ? (
                    <p className="text-[12px] font-bold text-slate-400">لا يوجد تحويلات بعد</p>
                ) : (
                    <div className="divide-y divide-slate-50 dark:divide-sira-border/30">
                        {assignmentRows.map((a: any) => {
                            const isRotation = String(a.assignmentType || '').toLowerCase() === 'rotation';
                            return (
                                <div key={String(a.id)} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[11px]">
                                    <div className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 flex-wrap">
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${isRotation ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                            {isRotation ? 'دوران' : labelFromEnum(a.assignmentType, t)}
                                        </span>
                                        {isRotation ? (
                                            <span className="text-slate-400">أُعيد للقائمة</span>
                                        ) : (
                                            <>
                                                <span>إلى</span>
                                                <PersonnelNameLink user={a.assignedUser} className="font-black text-sira-brown" />
                                            </>
                                        )}
                                        {a.assigner && (
                                            <>
                                                <span className="text-slate-300">·</span>
                                                <span className="text-slate-400">بواسطة</span>
                                                <PersonnelNameLink user={a.assigner} className="font-black text-slate-600" />
                                            </>
                                        )}
                                    </div>
                                    <span className="text-slate-400 shrink-0">{formatDt(a.assignedAt, t)}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    /* const resetInlineFeedbackForm = () => {
        setSelectedFeedbackStatus(String(lead?.status || 'new_lead'));
        setUpdateFeedbackNotes('');
    }; */

    if (loading && !lead) {
        return (
            <PageWrapper dir={pageDir} className="flex items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-sira-brown" />
            </PageWrapper>
        );
    }

    if (!lead) return <PageWrapper dir={pageDir} className="p-8"><p>{t('leadDetail.leadNotFound')}</p></PageWrapper>;

    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || '—';
    const tabs = [
        { id: 'assignments', label: t('leadDetail.tabs.assignments').toUpperCase() },
        { id: 'meetings', label: t('leadDetail.tabs.meetings').toUpperCase() },
        { id: 'activity', label: t('leadDetail.tabs.activity').toUpperCase() },
        { id: 'feedback', label: t('leadDetail.tabs.feedback').toUpperCase() }
    ];

    const waDigits = getPhoneDigits(lead.phone);
    const telDigits = getPhoneDigits(lead.phone);

    const feedbackPanel = (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-sira-border dark:bg-sira-bg-card sm:rounded-[2rem] sm:p-6 md:p-8">
            <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#0B1828] dark:bg-foreground/5 dark:text-foreground">
                    <Zap className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-[22px] font-black text-[#0B1828] dark:text-foreground leading-tight">
                        {t('leadDetail.updateFeedback', { defaultValue: 'Update feedback' })}
                        <span className="mx-1 text-[18px] font-black text-[#0B1828]">(Update Feedback)</span>
                    </h2>
                    <p className="text-[15px] font-bold text-slate-400">
                        {t('leadDetail.selectLeadStage', { defaultValue: 'Select lead stage' })}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                {feedbackStatusOptions.map((value) => {
                    const tile = resolveFeedbackGridTile(value);
                    const tileLabel = translateLeadStatus(t, value);
                    const selected = selectedFeedbackStatus === value;
                    const cls = feedbackTileClasses(value);
                    return (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setSelectedFeedbackStatus(value)}
                            className={cn(
                                'relative flex min-h-[100px] flex-col items-center justify-center gap-2.5 rounded-2xl border-2 p-3 text-center transition-all duration-200 active:scale-[0.97]',
                                selected ? cls.active + ' shadow-lg scale-[1.02]' : cls.idle + ' hover:shadow-md hover:scale-[1.01]',
                            )}
                        >
                            {selected && (
                                <span className="absolute top-2 end-2 flex h-4 w-4 items-center justify-center rounded-full bg-white/30">
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </span>
                            )}
                            <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl transition-colors', selected ? cls.iconActive : cls.iconIdle)}>
                                {tile.icon}
                            </div>
                            <span className="text-[12px] font-black leading-tight text-center">{tileLabel}</span>
                        </button>
                    );
                })}
            </div>

            <textarea
                value={updateFeedbackNotes}
                onChange={(e) => setUpdateFeedbackNotes(e.target.value)}
                placeholder={`${t('leadDetail.feedbackNotesPlaceholder', {
                    defaultValue: 'Write your notes here about this lead and next steps...',
                })} *`}
                required
                className="mt-6 min-h-[120px] w-full resize-none rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-[13px] font-bold text-[#0B1828] outline-none transition-all placeholder:text-slate-400 focus:border-[#0B1828]/20 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
            />

            <div className="mt-4 flex justify-center sm:justify-start">
                <button
                    type="button"
                    onClick={() => handleSaveInlineFeedback(false)}
                    disabled={isSavingFeedback}
                    className="inline-flex h-12 min-w-[160px] items-center justify-center gap-2 rounded-2xl bg-[#0B1828] px-7 text-[15px] font-black text-white shadow-sm transition-all hover:bg-[#16263a] disabled:opacity-50"
                >
                    {isSavingFeedback ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t('common.save')}
                </button>
            </div>
        </div>
    );

    const profilePanel = (
        <div className="lg:sticky lg:top-4">
            <div className="flex flex-col gap-6">
                <div className="overflow-hidden rounded-[2.5rem] bg-[#0B1828] p-6 text-white shadow-2xl sm:rounded-[4.5rem] sm:p-10">
                    <div className="mb-5 flex flex-col items-center sm:mb-8">
                        <div className="mb-4 h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center text-2xl shadow-inner border border-white/10 sm:mb-6 sm:h-24 sm:w-24 sm:rounded-[2.5rem] sm:text-3xl">
                            👤
                        </div>
                        <h1 className="font-black tracking-tight mb-3 text-center text-xl sm:text-3xl">
                            {lead.firstName || ''} {lead.lastName || ''}
                        </h1>
                        <div className="mb-6 sm:mb-10">
                            <ProfileStatusStrip status={lead.status} />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <span className="text-[14px] font-bold text-slate-400 tracking-wide">{t('leadDetail.phone')}:</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] font-black text-white" dir="ltr">
                                    {formatPhoneWithCountryCode(lead.phone) || (t('common.notExist') || 'not exist')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!lead.phone) return;
                                        navigator.clipboard.writeText(formatPhoneWithCountryCode(lead.phone));
                                        toast.success(t('common.copied') || 'Copied!');
                                    }}
                                    className={cn(
                                        'inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white transition-colors hover:bg-white/20',
                                        !lead.phone && 'pointer-events-none opacity-40',
                                    )}
                                    title={t('common.copy') || 'Copy'}
                                    aria-label={t('common.copy') || 'Copy'}
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                                <PhoneLookupButton phone={lead.phone} size={13} />
                            </div>
                        </div>
                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <span className="text-[14px] font-bold text-slate-400 tracking-wide">{t('leads.projectLabel')}:</span>
                            <span className={cn("text-[14px] font-black text-white")}>
                                {lead.campaign?.name || lead.dataBatch?.batchName || (t('common.notExist') || 'not exist')}
                            </span>
                        </div>
                        {canViewLeadSource ? (
                            <div className="flex items-center justify-between">
                                <span className="text-[14px] font-bold text-slate-400 tracking-wide">{t('leadDetail.source')}:</span>
                                <span className="text-[14px] font-black text-blue-400">
                                    {leadSourceLine(lead, t) === '—' ? (t('common.notExist') || 'not exist') : leadSourceLine(lead, t)}
                                </span>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4">
                        <div className="rounded-2xl bg-white/5 p-3 text-center ring-1 ring-white/10 sm:rounded-[2rem] sm:p-5">
                            <p className="text-xl font-black text-white sm:text-2xl">{salesScopedMeetings.length}</p>
                            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:mt-1 sm:text-[12px]">{t('leadDetail.meetings')}</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3 text-center ring-1 ring-white/10 sm:rounded-[2rem] sm:p-5">
                            <p className="text-xl font-black text-white sm:text-2xl">{salesScopedFeedbacks.length}</p>
                            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:mt-1 sm:text-[12px]">{t('leadDetail.tabs.feedback')}</p>
                        </div>
                    </div>
                </div>
                {assignmentCountdownText && (
                    <div className="rounded-[2.25rem] border border-rose-200 bg-rose-50 px-6 py-5 text-center shadow-sm">
                        <div className="flex items-center justify-center gap-2 text-[25px] text-rose-600">
                            <Clock className="h-6 w-6" />
                        </div>
                        <p className="mt-1 text-[24px] font-black text-rose-600">{assignmentCountdownText}</p>
                        <p className="text-[12px] font-bold text-rose-500">
                            {t('leadDetail.followUpHint', { defaultValue: 'Please update feedback before this lead is reassigned.' })}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <PageWrapper dir={pageDir} className="bg-white dark:bg-transparent">
            <div className="w-full space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm dark:border-sira-border dark:bg-sira-bg-card sm:rounded-[3rem] sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                        {/* Back */}
                        <button
                            type="button"
                            onClick={() => {
                                const leadsState = (location.state as any)?.leadsState;
                                if (leadsState) { navigate('/leads', { state: { leadsState } }); return; }
                                navigate('/leads');
                            }}
                            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[11px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-[#0B1828] sm:px-3 sm:text-[12px]"
                        >
                            <ArrowLeft className={cn('h-3.5 w-3.5', isRtl ? '' : 'rotate-180')} />
                            <span className="hidden sm:inline">{t('leadDetail.backToLeads')}</span>
                        </button>

                        {/* Action buttons — icon+label on md+, icon-only on mobile */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setScheduleOpen(true)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#b49a39] px-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md transition-all hover:bg-[#a68d2f] sm:h-10 sm:px-5 sm:text-[13px]"
                            >
                                <Calendar className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">{t('leadDetail.quickActions.booking', { defaultValue: 'جولة' })}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { if (!waDigits) return; window.open(`https://wa.me/${waDigits}`, '_blank', 'noopener,noreferrer'); }}
                                className={cn(
                                    'inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#16a34a] px-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md transition-all hover:bg-[#15803d] sm:h-10 sm:px-5 sm:text-[13px]',
                                    !waDigits && 'pointer-events-none opacity-40',
                                )}
                            >
                                <MessageCircle className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">{t('leadDetail.quickActions.whatsapp', { defaultValue: 'واتساب' })}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { if (!telDigits) return; window.location.href = `tel:${telDigits}`; }}
                                className={cn(
                                    'inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0b63ff] px-3 text-[11px] font-black uppercase tracking-widest text-white shadow-md transition-all hover:bg-[#0956dd] sm:h-10 sm:px-5 sm:text-[13px]',
                                    !telDigits && 'pointer-events-none opacity-40',
                                )}
                            >
                                <Phone className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">{t('leadDetail.quickActions.callNow', { defaultValue: 'اتصال' })}</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    className={cn(
                        'grid gap-6 lg:gap-8',
                        showManagerReport
                            ? (isRtl ? 'lg:grid-cols-[320px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_320px]')
                            : (isRtl ? 'lg:grid-cols-[380px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_380px]'),
                    )}
                >
                    {isRtl ? (
                        <>
                            {profilePanel}
                            {showFeedbackForm ? feedbackPanel : managerReportPanel}
                        </>
                    ) : (
                        <>
                            {showFeedbackForm ? feedbackPanel : managerReportPanel}
                            {profilePanel}
                        </>
                    )}
                </div>

                <Card className="p-0 overflow-hidden border-slate-100 shadow-none">
                    <SiraTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
                    <div className="p-6">
                                {activeTab === 'assignments' && (
                                    <div className="space-y-4">
                                        {isSalesViewer ? (
                                            <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] font-bold text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300">
                                                {t('leadDetail.salesScopedAssignmentsHint')}
                                            </p>
                                        ) : null}
                                        <table className={cn("w-full", isRtl ? "text-right" : "text-left")}>
                                            <thead>
                                                <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                                    <th className="py-3 px-2">{t('leadDetail.when')}</th>
                                                    <th className="py-3 px-2">{t('leadDetail.assignedTo')}</th>
                                                    <th className="py-3 px-2">{t('leadDetail.by')}</th>
                                                    <th className="py-3 px-2">{t('leadDetail.type')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-sira-border/30">
                                                {assignmentRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={4} className="py-12 text-center text-[12px] font-bold text-slate-500 dark:text-slate-400">
                                                            {isSalesViewer
                                                                ? t('leadDetail.salesScopedAssignmentsEmpty')
                                                                : t('leadDetail.noAssignmentsYet')}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    assignmentRows.map((a: any) => (
                                                        <tr key={a.id} className="hover:bg-sira-bg-hover transition-colors">
                                                            <td className="py-3 px-2 text-[11px] font-bold text-sira-text-primary">{formatDt(a.assignedAt, t)}</td>
                                                            <td className="py-3 px-2 text-[11px]">
                                                                {String(a.assignmentType || '').toLowerCase() === 'rotation' ? (
                                                                    <span className="font-black text-slate-500">{t('leadDetail.unassigned')}</span>
                                                                ) : (
                                                                    <PersonnelNameLink user={a.assignedUser} className="font-black text-sira-brown" />
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-2 text-[11px]">
                                                                {a.assigner ? (
                                                                    <PersonnelNameLink user={a.assigner} className="font-black text-sira-brown" />
                                                                ) : (
                                                                    <span className="font-black text-slate-500">{t('common.system', { defaultValue: 'System' })}</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-2">
                                                                <span className="bg-slate-50 text-slate-500 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                                    {String(a.assignmentType || '').toLowerCase() === 'rotation'
                                                                        ? t('leadDetail.timeline.rotation')
                                                                        : labelFromEnum(a.assignmentType, t)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {activeTab === 'meetings' && (
                                    <div className="grid gap-6">
                                        {isSalesViewer ? (
                                            <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] font-bold text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300">
                                                {t('leadDetail.salesScopedMeetingsHint')}
                                            </p>
                                        ) : null}
                                        {salesScopedMeetings.length > 0 ? salesScopedMeetings.map((m: any) => (
                                            <div 
                                                key={m.id} 
                                                onClick={() =>
                                                    navigate('/meetings', {
                                                        state: {
                                                            highlightMeetingId:
                                                                m?.id != null ? Number(m.id) : undefined,
                                                        },
                                                    })
                                                }
                                                className="flex items-center justify-between p-6 rounded-2xl border border-sira-border bg-sira-bg-hover hover:border-sira-brown/30 transition-all group cursor-pointer shadow-premium"
                                            >
                                                <div className="flex items-center gap-5">
                                                    <div className="p-4 rounded-xl bg-white shadow-sm border border-sira-border group-hover:bg-sira-brown-light transition-colors">
                                                        <Calendar className="w-6 h-6 text-sira-brown" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-black text-sira-text-primary mb-1">{formatDt(m.meetingDate, t)}</p>
                                                        <p className="text-[9px] font-bold text-sira-text-muted uppercase tracking-wider flex items-center gap-1 flex-wrap">
                                                            {labelFromEnum(m.meetingType, t)}
                                                            {m.scheduler && (
                                                                <>
                                                                    <span className="mx-1">·</span>
                                                                    <span>{t('common.by', { defaultValue: 'By' })}</span>
                                                                    <PersonnelNameLink user={m.scheduler} className="hover:text-sira-gold transition-colors font-black text-sira-brown" />
                                                                </>
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm", meetingStatusClass(m.status))}>
                                                    {labelFromEnum(m.status, t)}
                                                </span>
                                            </div>
                                        )) : (
                                            <div className="text-center py-20 bg-sira-bg-subtle/30 rounded-[32px] border-2 border-dashed border-sira-border">
                                                <Calendar className="w-16 h-16 text-sira-text-muted mx-auto mb-4 opacity-20" />
                                                <p className="text-sira-text-primary text-[11px] font-black uppercase tracking-widest italic">
                                                    {isSalesViewer ? t('leadDetail.salesScopedMeetingsEmpty') : t('leadDetail.noMeetingsFound')}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeTab === 'activity' && (
                                    <div className="relative space-y-0">
                                        {isSalesViewer ? (
                                            <p className="mb-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] font-bold text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300">
                                                {t('leadDetail.salesScopedActivityHint')}
                                            </p>
                                        ) : null}
                                        <div className="absolute top-4 bottom-4 start-5 w-0.5 bg-slate-200 dark:bg-sira-border/40" aria-hidden />
                                        {timeline.length === 0 ? (
                                            <div className="py-16 text-center text-[12px] font-bold text-slate-500 dark:text-slate-400">
                                                {isSalesViewer
                                                    ? t('leadDetail.salesScopedActivityEmpty')
                                                    : t('leadDetail.noActivityYet')}
                                            </div>
                                        ) : (
                                            timeline.map((item, idx) => (
                                                <div key={idx} className="flex gap-5 items-start py-5 group relative">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl shrink-0 z-10 flex items-center justify-center transition-all group-hover:scale-110",
                                                        item.type === 'assignment' ? "bg-slate-50 dark:bg-foreground/5" :
                                                        item.type === 'meeting' ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-amber-50 dark:bg-amber-500/10"
                                                    )}>
                                                        {item.icon}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                                            <span className="text-[12px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">{item.label}</span>
                                                            <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 dark:bg-foreground/10 dark:text-slate-300">
                                                                {formatTimelineMs(item.at)}
                                                            </span>
                                                        </div>
                                                        <p className="whitespace-pre-wrap break-words text-[11px] font-bold leading-relaxed text-[#0B1828] dark:text-slate-100">
                                                            {item.detail}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {activeTab === 'feedback' && (
                                    <div className="space-y-6">
                                        {isSalesViewer ? (
                                            <p className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-[11px] font-bold text-slate-600 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300">
                                                {t('leadDetail.salesScopedFeedbackHint')}
                                            </p>
                                        ) : null}
                                        <div className="space-y-3">
                                            {salesScopedFeedbacks
                                                .filter((f: any) => String(f.feedbackType || '').toLowerCase() !== 'note')
                                                .sort(
                                                    (a: any, b: any) =>
                                                        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
                                                )
                                                .map((f: any) => {
                                                    const statusText = labelFromEnum(f.feedbackType, t);
                                                    const note = f.description ? String(f.description).trim() : '';
                                                    return (
                                                        <div
                                                            key={String(f.id)}
                                                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-sira-border dark:bg-foreground/5"
                                                        >
                                                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:bg-foreground/10 dark:text-slate-200">
                                                                        {statusText}
                                                                    </span>
                                                                    {f.user && (
                                                                        <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                                                            {t('common.by', { defaultValue: 'By' })} <PersonnelNameLink user={f.user} className="hover:text-sira-gold transition-colors font-black text-sira-brown" />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-400">
                                                                    {formatDt(f.createdAt, t)}
                                                                </span>
                                                            </div>
                                                            <p className="whitespace-pre-wrap break-words text-[11px] font-bold text-[#0B1828] dark:text-slate-100">
                                                                {note || statusText}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            {salesScopedFeedbacks.filter((f: any) => String(f.feedbackType || '').toLowerCase() !== 'note')
                                                .length === 0 && (
                                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-xs font-bold text-slate-500 dark:border-sira-border dark:bg-foreground/5 dark:text-slate-300">
                                                    {t('leadDetail.noFeedbackYet', { defaultValue: 'No feedback history yet.' })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                    </div>
                </Card>
            </div>

            {/* Modals */}
            {feedbackOpen && (
                <AddFeedbackModal
                    leadId={Number(lead.id)}
                    userId={currentUser?.id != null ? Number(currentUser.id) : 0}
                    currentStatus={lead.status || 'new_lead'}
                    onClose={() => setFeedbackOpen(false)}
                    onSuccess={() => { setFeedbackOpen(false); load(); }}
                />
            )}
            {scheduleOpen && (
                <ScheduleMeetingMiniModal
                    leadId={Number(lead.id)}
                    leadName={name}
                    onClose={() => setScheduleOpen(false)}
                    onSuccess={() => { setScheduleOpen(false); load(); }}
                />
            )}
            {transferOpen && (
                <BulkAssignModal
                    isOpen={transferOpen}
                    leadIds={[Number(lead.id)]}
                    onClose={() => setTransferOpen(false)}
                />
            )}

            <Modal
                isOpen={showMeetingPrompt}
                onClose={() => setShowMeetingPrompt(false)}
                title={t('leadDetail.meetingPromptTitle', { defaultValue: 'Schedule meeting?' })}
                subtitle={t('leadDetail.meetingPromptSubtitle', { defaultValue: 'Would you like to schedule a meeting with this lead now?' })}
            >
                <div className="flex flex-col gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => {
                            setShowMeetingPrompt(false);
                            setScheduleOpen(true);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1828] py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-[0.98]"
                    >
                        {t('common.yes')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowMeetingPrompt(false)}
                        className="flex w-full items-center justify-center py-2 text-[12px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600"
                    >
                        {t('common.no')}
                    </button>
                </div>
            </Modal>
        </PageWrapper>
    );
}
