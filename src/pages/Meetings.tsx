import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import {
    MapPin,
    Loader2,
    Play,
    Square,
    Calendar,
    Users,
    Clock,

    CheckCircle2,
    BarChart3,
    Search,
    Plus,
    FileText,
    MessageSquare,
    CalendarPlus,
    Check,
    CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Modal from '../components/ui/Modal';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import EndMeetingFeedbackModal from '../components/meetings/EndMeetingFeedbackModal';
import MeetingLocationsMap from '../components/meetings/MeetingLocationsMap';
import { getMeetingTypes } from '../components/leads/LeadDetailMiniModals';
import { PersonnelNameLink } from '../components/leads/PersonnelNameLink';
import { cn } from '../lib/utils';
import {
    getQualifiedLeads,
    getAllLeads,
    getLeadById,
    getMeetings,
    getMeetingStats,
    getMeeting,
    createMeeting,
    updateMeeting,
    getAllTeams,
    getAccountsForTeams,
} from '../services/api';
import { toast } from '../lib/toast';
import { coordsToMeetingString, getMeetingGpsPosition } from '../utils/meetingGeolocation';
import { useTranslation } from 'react-i18next';
import { getRoleDisplayName } from '../lib/userRole';

// Normalized status and types helper
function getStatusLabel(s: string, t: any) {
    const key = s === 'checkin' ? 'in_progress' : s === 'checkout' ? 'completed' : s;
    return t(`meetings.status.${key}`, { defaultValue: key });
}

function meetingStatusForActions(status: string | undefined, startedAt?: string | null) {
    const s = String(status || '');
    if (s === 'checkin') return startedAt ? 'in_progress' : 'scheduled';
    if (s === 'checkout') return 'completed';
    return s;
}

function meetingStatusClass(status: string) {
    const s = String(status || '');
    if (s === 'completed') return 'bg-sira-green/10 text-sira-green border border-sira-green/30';
    if (s === 'in_progress') return 'bg-sira-gold/10 text-sira-gold border border-sira-gold/20';
    if (s === 'scheduled') return 'bg-sira-brown/10 text-sira-brown border border-sira-brown/20';
    if (s === 'no_show') return 'bg-red-500/10 text-red-700 border border-red-500/20';
    return 'bg-sira-bg-subtle text-sira-text-muted border border-sira-border';
}

function formatDate(d: string | Date) {
    const date = typeof d === 'string' ? new Date(d) : d;
    return date.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

function parseMeetingLatLng(value: unknown): { lat: number; lng: number } | null {
    if (typeof value !== 'string') return null;
    const parts = value.split(',').map((p) => Number(p.trim()));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
    const [lat, lng] = parts;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
}

function googleMapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

const LEADS_PAGE_SIZE = 8;
const MEETINGS_PAGE_SIZE = 10;

export default function Meetings() {
    const { t } = useTranslation();
    const currentUser = useSelector((state: any) => state.user.user);
    const roleName = typeof currentUser?.role === 'string' ? currentUser.role : currentUser?.role?.name ?? '';
    const isSuperAdmin = roleName === 'super_admin';
    const isOperationManager = roleName === 'operation_manager';
    const canSeeMeetingAnalytics =
        isSuperAdmin || isOperationManager || roleName === 'sales_manager' || roleName === 'tech_lead';
    const canViewMeetingDetails = isSuperAdmin || isOperationManager || roleName === 'tech_lead';

    const [stats, setStats] = useState<any>(null);
    const [teams, setTeams] = useState<any[]>([]);
    const [filterTeamId, setFilterTeamId] = useState('');
    const [filterUserId, setFilterUserId] = useState('');
    const [allSales, setAllSales] = useState<any[]>([]);
    const [qualifiedLeads, setQualifiedLeads] = useState<any[]>([]);
    const [meetings, setMeetings] = useState<any[]>([]);
    const [meetingsPage, setMeetingsPage] = useState(1);
    const [meetingsTotalPages, setMeetingsTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const filteredSalesForMemberSelect = useMemo(() => {
        if (!filterTeamId || filterTeamId === '__all_teams__') return allSales;
        return allSales.filter(s => String(s.teamId) === String(filterTeamId));
    }, [allSales, filterTeamId]);

    const [createOpen, setCreateOpen] = useState(false);
    const [selectedLeadForMeeting, setSelectedLeadForMeeting] = useState<any>(null);
    const [endOpen, setEndOpen] = useState(false);
    const [meetingToEnd, setMeetingToEnd] = useState<any>(null);

    const observerTarget = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loading && meetingsPage < meetingsTotalPages) {
                    setMeetingsPage((p) => p + 1);
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [loading, meetingsPage, meetingsTotalPages]);
    const [startingId, setStartingId] = useState<number | null>(null);
    const [detailMeeting, setDetailMeeting] = useState<any>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const locationState = useLocation().state as
        | { highlightMeetingId?: number; openCreate?: boolean; leadId?: number | string }
        | null;

    // Handle deep link from Lead Detail Page
    useEffect(() => {
        if (!canViewMeetingDetails) return;
        if (locationState?.highlightMeetingId) {
            const hId = locationState.highlightMeetingId;
            const openDeepLink = async () => {
                setDetailLoading(true);
                try {
                    const full = await getMeeting(hId);
                    setDetailMeeting(full);
                } catch {
                    toast.error(t('meetings.failedDetails'));
                } finally {
                    setDetailLoading(false);
                }
            };
            openDeepLink();
        }
    }, [locationState, canViewMeetingDetails]);

    // Handle quick-create deep link from Leads table
    useEffect(() => {
        if (!locationState?.openCreate) return;
        if (locationState?.leadId != null) {
            setSelectedLeadForMeeting({ id: Number(locationState.leadId) });
        }
        setCreateOpen(true);
    }, [locationState]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const meetingParams = (filterUserId || filterTeamId) ? { userId: filterUserId || undefined, teamId: filterTeamId || undefined } : undefined;

            const promises: Promise<any>[] = [
                getMeetings(meetingsPage, MEETINGS_PAGE_SIZE, meetingParams)
            ];
            if (meetingsPage === 1) {
                promises.push(getQualifiedLeads(1, LEADS_PAGE_SIZE));
            }

            const results = await Promise.all(promises);
            const meetingsRes = results[0];
            const meetingsData = Array.isArray(meetingsRes?.data) ? meetingsRes.data : [];

            if (meetingsPage === 1) {
                const leadsRes = results[1];
                const leadsData = leadsRes?.data ?? [];
                setQualifiedLeads(Array.isArray(leadsData) ? leadsData : []);
                setMeetings(meetingsData);
            } else {
                setMeetings(prev => {
                    const existingIds = new Set(prev.map((m: any) => m.id));
                    const newItems = meetingsData.filter((m: any) => !existingIds.has(m.id));
                    return [...prev, ...newItems];
                });
            }
            // setMeetingsTotal(meetingsRes?.meta?.total ?? 0);
            setMeetingsTotalPages(meetingsRes?.meta?.totalPages ?? 1);
        } catch (e) {
            toast.error(t('meetings.failedLoad'));
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        if (!canSeeMeetingAnalytics) return;
        try {
            const data = await getMeetingStats();
            setStats(data);
        } catch {
            setStats(null);
        }
    };

    useEffect(() => {
        fetchData();
    }, [meetingsPage, filterUserId, filterTeamId]);

    useEffect(() => {
        fetchStats();
    }, [canSeeMeetingAnalytics]);

    useEffect(() => {
        if (canSeeMeetingAnalytics) {
            getAllTeams().then((d) => setTeams(Array.isArray(d) ? d : d?.data ?? []));
            getAccountsForTeams().then(data => {
                const sales = data.sales || [];
                if (currentUser?.role?.name === 'operation_manager' && !sales.find((s: any) => s.id === currentUser.id)) {
                    sales.push(currentUser);
                }
                setAllSales(sales);
            });
        }
    }, [canSeeMeetingAnalytics]);

    const handleStartMeeting = async (meeting: any) => {
        const id = Number(meeting.id);
        setStartingId(id);
        try {
            toast.loading(t('meetings.gettingLocation'), { id: 'meeting-checkin-geo' });

            const pos = await getMeetingGpsPosition();
            const currentLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
            toast.dismiss('meeting-checkin-geo');

            await updateMeeting(id, {
                status: 'in_progress',
                startedAt: new Date().toISOString(),
                currentLocation,
            });
            toast.success(t('meetings.startedWithLocation'));
            fetchData();
        } catch (e: any) {
            toast.dismiss('meeting-checkin-geo');
            const geoCode = e?.code;
            if (geoCode === 1) {
                toast.error(t('meetings.locationPermissionDenied'));
                return;
            }
            if (geoCode === 2) {
                toast.error(t('meetings.locationUnavailable'));
                return;
            }
            if (geoCode === 3) {
                toast.error(t('meetings.locationTimedOut'));
                return;
            }
            toast.error(e?.response?.data?.message || t('meetings.failedStart'));
        } finally {
            toast.dismiss('meeting-checkin-geo');
            setStartingId(null);
        }
    };

    const handleEndMeeting = (meeting: any) => {
        setMeetingToEnd(meeting);
        setEndOpen(true);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-sira-text-muted gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-sira-brown" />
                <p className="font-bold uppercase tracking-widest text-[10px]">{t('meetings.loading')}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen overflow-x-hidden bg-sira-bg-page p-3 sm:p-4 md:p-10 space-y-6 md:space-y-12">
            {/* Header with Title & Action */}
            <div className="mb-6 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between md:gap-8">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-1.5 rounded-full bg-sira-gold md:h-8" />
                        <h1 className="text-[24px] font-black uppercase leading-none tracking-tight text-sira-text-primary sm:text-[28px] lg:text-[40px]">{t('meetings.title')}</h1>
                    </div>
                    <p className="pl-3 text-[9px] font-black uppercase tracking-[0.22em] text-sira-text-muted sm:pl-4 sm:text-[10px] sm:tracking-[0.4em]">{t('meetings.meetingStatistics')}</p>
                </div>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-black/20 bg-sira-brown px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-premium transition-all hover:bg-sira-brown-dark active:scale-95 sm:h-14 sm:w-auto sm:gap-3 sm:px-8 sm:text-[12px] md:h-16 md:px-10 md:text-[13px] md:tracking-[0.2em]"
                >
                    <Plus className="h-4 w-4 sm:h-5 sm:w-5" /> {t('meetings.scheduleMeeting')}
                </button>
            </div>
            {/* Simplified KPI Dashboard */}
            {canSeeMeetingAnalytics && stats && (
                <div className="mb-8 grid grid-cols-1 gap-4 md:mb-16 md:grid-cols-2 md:gap-6 lg:grid-cols-3 lg:gap-8">
                    {/* Total Overview */}
                    <div className="group relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-5 shadow-premium transition-all hover:border-sira-gold/40 sm:p-6 md:rounded-[32px] md:p-8">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-sira-gold/5 rounded-bl-[120px] transition-all group-hover:scale-125" />
                        <div className="relative">
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sira-gold/10 text-sira-gold shadow-sm sm:mb-5 sm:h-12 sm:w-12 md:mb-6 md:h-14 md:w-14 md:rounded-2xl">
                                <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
                            </div>
                            <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em] mb-2">{t('meetings.total')}</p>
                            <h3 className="text-3xl font-black tracking-tighter text-sira-text-primary sm:text-4xl md:text-5xl">{stats?.total ?? 0}</h3>
                        </div>
                    </div>

                    {/* Completion Rate */}
                    <div className="group relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-5 shadow-premium transition-all hover:border-sira-green/40 sm:p-6 md:rounded-[32px] md:p-8">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-sira-green/5 rounded-bl-[120px] transition-all group-hover:scale-125" />
                        <div className="relative">
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sira-green/10 text-sira-green shadow-sm sm:mb-5 sm:h-12 sm:w-12 md:mb-6 md:h-14 md:w-14 md:rounded-2xl">
                                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
                            </div>
                            <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em] mb-2">{t('meetings.completed')}</p>
                            <h3 className="text-3xl font-black tracking-tighter text-sira-text-primary sm:text-4xl md:text-5xl">{stats?.completed ?? 0}</h3>
                        </div>
                    </div>

                    {/* Team Breakdown Summary */}
                    <div className="group relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-5 shadow-premium transition-all hover:border-sira-brown/40 sm:p-6 md:rounded-[32px] md:p-8">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-sira-brown/5 rounded-bl-[120px] transition-all group-hover:scale-125" />
                        <div className="relative">
                            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-sira-brown/10 text-sira-brown shadow-sm sm:mb-5 sm:h-12 sm:w-12 md:mb-6 md:h-14 md:w-14 md:rounded-2xl">
                                <Users className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
                            </div>
                            <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em] mb-3">{t('meetings.byTeam')}</p>
                            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2 sm:gap-3 md:gap-4">
                                {(stats?.byTeam || []).slice(0, 3).map((item: any) => (
                                    <div key={item.teamId || item.team} className="shrink-0 rounded-xl border border-sira-border/50 bg-sira-bg-subtle px-3 py-2 transition-colors hover:bg-white sm:rounded-2xl sm:px-5 sm:py-3">
                                        <p className="text-[9px] font-black text-sira-text-muted uppercase tracking-widest mb-1">{item.name || item.team}</p>
                                        <p className="text-[16px] font-black text-sira-brown">{item.count}</p>
                                    </div>
                                ))}
                                {(!stats?.byTeam || stats.byTeam.length === 0) && (
                                    <p className="text-[10px] font-bold text-sira-text-muted uppercase">{t('common.noData')}</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Toolbar */}
            <div className="relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-4 shadow-premium sm:p-5 md:rounded-[32px] md:p-6">
                <div className="absolute top-0 left-0 w-2 h-full bg-sira-brown/10" />
                <div className="flex items-center gap-3 pl-2 sm:gap-4 md:gap-5 md:pl-4">
                    <div className="w-12 h-12 rounded-2xl bg-sira-bg-subtle text-sira-brown flex items-center justify-center shadow-inner">
                        <Search className="w-5 h-5" />
                    </div>
                    <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-sira-text-primary sm:text-[12px] md:text-[13px] md:tracking-[0.3em]">
                        {canSeeMeetingAnalytics ? t('meetings.title') : t('meetings.myMeetings')}
                    </h2>
                </div>

                {canSeeMeetingAnalytics && (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-5 md:gap-4">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <span className="text-[9px] font-black text-sira-text-muted uppercase tracking-[0.3em] pl-1">{t('meetings.allTeams')}</span>
                            <Select
                                value={filterTeamId || '__all_teams__'}
                                onValueChange={(v) => {
                                    setFilterTeamId(v === '__all_teams__' ? '' : v);
                                    setMeetingsPage(1);
                                }}
                            >
                                <SelectTrigger className="h-12 rounded-xl bg-sira-bg-subtle border-sira-border text-[13px] font-black shadow-none focus:ring-4 focus:ring-sira-brown/5 transition-all uppercase !text-[#0B1828] [&_span]:!text-[#0B1828]">
                                    <SelectValue placeholder={t('meetings.allTeams')} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-sira-border shadow-2xl [&_[data-slot='select-item'][data-highlighted]]:bg-[#0B1828] [&_[data-slot='select-item'][data-highlighted]]:text-white">
                                    <SelectItem value="__all_teams__" className="text-[12px] font-black uppercase text-[#0B1828]">{t('meetings.allTeams')}</SelectItem>
                                    {teams.map((t: any) => (
                                        <SelectItem key={String(t.id)} value={String(t.id)} className="text-[12px] font-black uppercase text-[#0B1828]">
                                            {t.name ?? t.teamName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex min-w-0 flex-col gap-1.5">
                            <span className="text-[9px] font-black text-sira-text-muted uppercase tracking-[0.3em] pl-1">{t('meetings.allUsers')}</span>
                            <Select
                                value={filterUserId || '__all_users__'}
                                onValueChange={(v) => {
                                    setFilterUserId(v === '__all_users__' ? '' : v);
                                    setMeetingsPage(1);
                                }}
                            >
                                <SelectTrigger className="h-12 rounded-xl bg-sira-bg-subtle border-sira-border text-[13px] font-black shadow-none focus:ring-4 focus:ring-sira-brown/5 transition-all uppercase !text-[#0B1828] [&_span]:!text-[#0B1828]">
                                    <SelectValue placeholder={t('meetings.allUsers')} />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-sira-border shadow-2xl [&_[data-slot='select-item'][data-highlighted]]:bg-[#0B1828] [&_[data-slot='select-item'][data-highlighted]]:text-white">
                                    <SelectItem value="__all_users__" className="text-[12px] font-black uppercase text-[#0B1828]">{t('meetings.allUsers')}</SelectItem>
                                    {filteredSalesForMemberSelect.map((u: any) => (
                                        <SelectItem key={String(u.id)} value={String(u.id)} className="text-[12px] font-black uppercase text-[#0B1828]">
                                            {u.firstName} {u.lastName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}
            </div>

            {/* Meetings List */}
            <div className="space-y-6">
                {meetings.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-24 bg-white shadow-premium rounded-[40px] border-2 border-dashed border-sira-border mx-auto max-w-4xl"
                    >
                        <Calendar className="w-16 h-16 text-sira-brown/20 mx-auto mb-6" />
                        <p className="text-sira-text-primary text-[14px] font-black uppercase tracking-[0.3em]">{t('meetings.noMeetings')}</p>
                    </motion.div>
                ) : (
                    <div className="grid gap-4 md:gap-8 lg:gap-10">
                        <AnimatePresence mode="popLayout">
                            {meetings.map((m) => {
                                const lead = m.lead;
                                const actionStatus = meetingStatusForActions(m.status, m.startedAt);
                                const isScheduled = actionStatus === 'scheduled';
                                const isInProgress = actionStatus === 'in_progress';
                                const starting = startingId === Number(m.id);

                                return (
                                    <motion.div
                                        key={String(m.id)}
                                        layout
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        className="group relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-4 shadow-premium transition-all hover:border-sira-gold/30 sm:p-6 md:rounded-[40px] md:p-8 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:p-10"
                                    >
                                        {/* Status Accent Line */}
                                        <div className={cn(
                                            "absolute top-0 bottom-0 left-0 w-3 transition-all group-hover:w-4",
                                            m.status === 'completed' ? "bg-sira-green" :
                                                m.status === 'in_progress' ? "bg-sira-gold" :
                                                    m.status === 'no_show' ? "bg-red-500" : "bg-sira-brown/40"
                                        )} />

                                        <div className="flex items-start gap-4 sm:gap-6 md:gap-8 lg:items-center lg:gap-10">
                                            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sira-bg-subtle text-sira-brown shadow-inner transition-transform group-hover:scale-105 sm:h-16 sm:w-16 sm:rounded-[24px] md:h-20 md:w-20 md:rounded-[28px] lg:h-24 lg:w-24 lg:rounded-[32px]">
                                                <div className="absolute inset-0 bg-sira-gold/5 rounded-[32px] animate-pulse" />
                                                <Calendar className="relative z-10 h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12" />
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-4 flex-wrap">
                                                    <h3 className="text-[18px] font-black uppercase tracking-tight text-sira-text-primary sm:text-[20px] md:text-[22px] lg:text-[28px]">
                                                        {lead?.firstName} {lead?.lastName}
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <span className={cn(
                                                            "px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-premium border border-white/20",
                                                            meetingStatusClass(m.status)
                                                        )}>
                                                            {getStatusLabel(m.status, t)}
                                                        </span>
                                                        <span className="px-4 py-2 rounded-xl bg-sira-bg-subtle border border-sira-border text-sira-gold text-[9px] font-black uppercase tracking-widest">
                                                            {t(`meetings.types.${m.meetingType}`, { defaultValue: m.meetingType })}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-10 gap-y-4 text-[13px] font-bold text-sira-text-secondary uppercase tracking-[0.2em]">
                                                    <div className="flex items-center gap-3 group/info">
                                                        <div className="w-9 h-9 rounded-xl bg-sira-gold/10 flex items-center justify-center text-sira-gold group-hover/info:bg-sira-gold group-hover/info:text-white transition-all">
                                                            <Clock className="w-5 h-5" />
                                                        </div>
                                                        <span className="font-black">{formatDate(m.meetingDate)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 group/info">
                                                        <div className="w-9 h-9 rounded-xl bg-sira-brown/10 flex items-center justify-center text-sira-brown group-hover/info:bg-sira-brown group-hover/info:text-white transition-all">
                                                            <MapPin className="w-5 h-5" />
                                                        </div>
                                                        <span className="truncate max-w-[300px] font-black">{m.location || t('common.notSpecified', { defaultValue: 'No Location' })}</span>
                                                    </div>
                                                </div>
                                                {m.scheduler && (
                                                    <div className="flex items-center gap-4 pt-5 border-t border-sira-border/30">
                                                        <div className="flex -space-x-2">
                                                            <div className="h-8 w-8 rounded-full bg-sira-brown flex items-center justify-center text-[10px] text-white font-black border-2 border-white ring-2 ring-sira-brown/10">
                                                                {m.scheduler.firstName?.[0]}{m.scheduler.lastName?.[0]}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-sira-text-muted uppercase tracking-widest leading-none mb-1">{t('meetings.scheduledFor')}</span>
                                                            <PersonnelNameLink user={m.scheduler} className="text-[11px] font-black text-sira-brown hover:text-sira-gold underline underline-offset-4 decoration-2 transition-all uppercase" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-2 flex w-full flex-wrap items-center gap-2 sm:gap-3 lg:mt-0 lg:w-auto lg:shrink-0 lg:border-l lg:border-sira-border lg:pl-10">
                                            {canViewMeetingDetails && (
                                                <button
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
                                                    className="text-[11px] font-black text-sira-text-muted hover:text-sira-gold underline underline-offset-8 decoration-2 uppercase tracking-[0.2em] transition-all px-6 py-4 rounded-2xl hover:bg-sira-gold/5"
                                                >
                                                    {t('meetings.details')}
                                                </button>
                                            )}

                                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 md:gap-4">
                                                {isScheduled && (
                                                    <button
                                                        onClick={() => handleStartMeeting(m)}
                                                        disabled={starting}
                                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-black/10 bg-sira-green px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-premium transition-all hover:brightness-110 active:translate-y-1 disabled:opacity-50 sm:h-12 sm:w-auto sm:px-6 sm:text-[11px] md:h-14 md:px-8 md:text-[12px]"
                                                    >
                                                        {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                                                        {t('meetings.beginMeeting')}
                                                    </button>
                                                )}
                                                {isInProgress && (
                                                    <button
                                                        onClick={() => handleEndMeeting(m)}
                                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border-b-4 border-black/10 bg-sira-brown px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-premium transition-all hover:bg-sira-brown-dark active:translate-y-1 sm:h-12 sm:w-auto sm:px-6 sm:text-[11px] md:h-14 md:px-8 md:text-[12px]"
                                                    >
                                                        <Square className="w-5 h-5 fill-current" /> {t('meetings.endMeeting')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
                {meetings.length > 0 && (
                    <div className="mt-10 flex flex-col items-center gap-4">
                        <div ref={observerTarget} className="h-10 w-full" />
                        {loading && meetingsPage > 1 && (
                            <div className="flex items-center gap-2 text-sira-gold">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{t('meetings.loading', { defaultValue: 'Loading...' })}</span>
                            </div>
                        )}
                        <div className="rounded-full bg-sira-bg-subtle px-6 py-2 border border-sira-border/50 text-[10px] font-black uppercase tracking-widest text-sira-text-muted shadow-sm">
                            {t('common.page', { defaultValue: 'Page' })} {meetingsPage} / {meetingsTotalPages}
                        </div>
                    </div>
                )}
            </div>

            {/* Meeting detail modal with location map */}
            <Modal
                isOpen={canViewMeetingDetails && Boolean(detailMeeting)}
                onClose={() => {
                    setDetailMeeting(null);
                    setDetailLoading(false);
                }}
                title={t('meetings.meetingDetails')}
                subtitle={t('meetings.meetingDetailsSubtitle')}
                size="3xl"
                headerIcon={
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
                        <CalendarDays className="h-6 w-6" aria-hidden />
                    </div>
                }
            >
                {detailLoading && (
                    <div className="flex flex-col items-center justify-center py-24 text-sira-text-muted gap-4">
                        <Loader2 className="w-14 h-14 animate-spin text-sira-gold" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">{t('meetings.loadingCheckInOut')}</span>
                    </div>
                )}
                {detailMeeting && !detailLoading && (() => {
                    const lead = detailMeeting.lead;
                    const checkInCoords = parseMeetingLatLng(detailMeeting.currentLocation);
                    const checkOutCoords = parseMeetingLatLng(detailMeeting.checkoutLocation);
                    return (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Summary Header */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-subtle p-8 hover:bg-white transition-all shadow-sm group">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-3 group-hover:text-sira-gold transition-colors">{t('meetings.lead')}</p>
                                    <p className="text-2xl font-black text-sira-text-primary uppercase tracking-tight">{lead?.firstName} {lead?.lastName}</p>
                                    {lead?.phone && <p className="text-sm mt-1 font-bold text-sira-text-secondary tabular-nums">{lead.phone}</p>}
                                </div>
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-subtle p-8 hover:bg-white transition-all shadow-sm group">
                                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-3 group-hover:text-sira-gold transition-colors">{t('meetings.statusLabel')}</p>
                                    <div className="flex flex-wrap gap-3">
                                        <span className={cn("px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest inline-block shadow-premium border-b-4 border-black/10", meetingStatusClass(detailMeeting.status))}>
                                            {getStatusLabel(detailMeeting.status, t)}
                                        </span>
                                        <span className="px-5 py-2.5 rounded-2xl bg-white border border-sira-border text-sira-gold text-[10px] font-black uppercase tracking-widest shadow-sm">
                                            {t(`meetings.types.${detailMeeting.meetingType}`, { defaultValue: detailMeeting.meetingType })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Detailed Panels */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-10 border-b border-sira-border/50">
                                <div className="space-y-8">
                                    <div className="flex items-start gap-5">
                                        <div className="w-12 h-12 rounded-[20px] bg-sira-bg-subtle border border-sira-border flex items-center justify-center text-sira-gold shadow-sm">
                                            <Clock className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-1.5">{t('meetings.scheduledDate')}</p>
                                            <p className="text-[15px] font-black text-sira-text-primary uppercase tracking-tight">{formatDate(detailMeeting.meetingDate)}</p>
                                        </div>
                                    </div>
                                    {detailMeeting.location && (
                                        <div className="flex items-start gap-5">
                                            <div className="w-12 h-12 rounded-[20px] bg-sira-bg-subtle border border-sira-border flex items-center justify-center text-sira-brown shadow-sm">
                                                <MapPin className="w-6 h-6" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-1.5">{t('meetings.plannedLocation')}</p>
                                                <p className="text-[14px] font-bold text-sira-text-secondary leading-snug break-words">{detailMeeting.location}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-6 rounded-[32px] bg-sira-bg-subtle border border-sira-border p-8 shadow-inner">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600">Check-in Sequence</p>
                                        </div>
                                        <p className="text-[13px] font-black text-sira-text-primary uppercase">
                                            {detailMeeting.startedAt ? formatDate(detailMeeting.startedAt) : t('meetings.beginToRecord')}
                                        </p>
                                        {detailMeeting.currentLocation && (
                                            <div className="mt-2.5">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                    {checkInCoords ? (
                                                        <a href={googleMapsUrl(checkInCoords.lat, checkInCoords.lng)} target="_blank" rel="noreferrer" className="text-[11px] font-black text-sira-gold hover:text-sira-brown underline underline-offset-4 decoration-2 uppercase tracking-widest">
                                                            {t('previewDetail.mapsLink')}
                                                        </a>
                                                    ) : (
                                                        <span className="text-[11px] font-bold text-sira-text-primary">{detailMeeting.currentLocation}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="pt-6 border-t border-sira-border/40">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-600">Check-out Sequence</p>
                                        </div>
                                        <p className="text-[13px] font-black text-sira-text-primary uppercase">
                                            {detailMeeting.endedAt ? formatDate(detailMeeting.endedAt) : t('meetings.endToRecord')}
                                        </p>
                                        {detailMeeting.checkoutLocation && (
                                            <div className="mt-2.5">
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                                    {checkOutCoords ? (
                                                        <a href={googleMapsUrl(checkOutCoords.lat, checkOutCoords.lng)} target="_blank" rel="noreferrer" className="text-[11px] font-black text-sira-gold hover:text-sira-brown underline underline-offset-4 decoration-2 uppercase tracking-widest">
                                                            {t('previewDetail.mapsLink')}
                                                        </a>
                                                    ) : (
                                                        <span className="text-[11px] font-bold text-sira-text-primary">{detailMeeting.checkoutLocation}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {detailMeeting.notes && (
                                <div className="rounded-[32px] border border-sira-border bg-white p-10 shadow-sm relative overflow-hidden group">
                                    <div className="absolute top-0 left-0 w-2 h-full bg-sira-gold/20" />
                                    <p className="text-[9px] font-black uppercase text-sira-gold flex items-center gap-2.5 mb-5 tracking-[0.3em]">
                                        <FileText className="w-4 h-4" /> {t('meetings.notes')}
                                    </p>
                                    <p className="text-[15px] font-bold text-sira-text-secondary leading-relaxed">"{detailMeeting.notes}"</p>
                                </div>
                            )}

                            {detailMeeting.feedback && (
                                <div className="rounded-[32px] border-2 border-dashed border-sira-gold/30 bg-sira-gold/[0.03] p-10 shadow-sm">
                                    <p className="text-[9px] font-black uppercase text-sira-gold tracking-[0.3em] mb-5 flex items-center gap-2.5">
                                        <MessageSquare className="w-4 h-4" /> {t('meetings.feedback')}
                                    </p>
                                    <p className="text-[15px] font-black text-sira-text-primary leading-relaxed uppercase tracking-tight">"{detailMeeting.feedback}"</p>
                                </div>
                            )}

                            {detailMeeting.scheduler && (
                                <div className="rounded-[32px] border border-sira-border bg-sira-bg-subtle p-10 border-t-8 border-t-sira-brown shadow-sm group">
                                    <p className="text-[9px] font-black uppercase tracking-[0.4em] text-sira-text-muted mb-4 group-hover:text-sira-gold transition-colors">{t('meetings.scheduledBy')}</p>
                                    <div className="flex items-center gap-5">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] border border-sira-brown/35 bg-[#EDE5DC]/90 font-black text-xl text-[#5c4330] shadow-sm transition-transform group-hover:scale-110">
                                            {detailMeeting.scheduler.firstName?.[0]}{detailMeeting.scheduler.lastName?.[0]}
                                        </div>
                                        <div className="space-y-1">
                                            <PersonnelNameLink user={detailMeeting.scheduler} className="text-lg font-black text-sira-text-primary uppercase hover:text-sira-gold transition-colors" />
                                            <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-widest">
                                                {getRoleDisplayName(detailMeeting.scheduler.role, t) || 'Staff'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-[32px] overflow-hidden border border-sira-border bg-white shadow-premium mt-12">
                                <div className="flex items-center gap-3 px-8 py-6 bg-sira-bg-subtle border-b border-sira-border">
                                    <MapPin className="w-5 h-5 text-sira-gold" />
                                    <h3 className="text-[11px] font-black uppercase text-sira-text-primary tracking-[0.3em]">
                                        Presence Mapping Analytics
                                    </h3>
                                </div>
                                <div className="p-4">
                                    <MeetingLocationsMap
                                        meeting={detailMeeting}
                                        planned={detailMeeting.location}
                                        checkIn={detailMeeting.currentLocation}
                                        checkOut={detailMeeting.checkoutLocation}
                                        heightClass="h-[450px]"
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Create meeting modal — lead chosen from list; we need to pass selected lead when "Schedule" is clicked */}
            <CreateMeetingModal
                isOpen={createOpen}
                onClose={() => { setCreateOpen(false); setSelectedLeadForMeeting(null); }}
                qualifiedLeads={qualifiedLeads}
                initialLeadId={selectedLeadForMeeting?.id != null ? String(selectedLeadForMeeting.id) : undefined}
                isManager={isSuperAdmin || isOperationManager}
                allSales={allSales}
                onSuccess={() => {
                    setCreateOpen(false);
                    setSelectedLeadForMeeting(null);
                    fetchData();
                    fetchStats();
                }}
            />

            {/* End meeting — same feedback form as lead page (type, outcome, description) + creates lead feedback */}
            {endOpen && meetingToEnd && (
                <EndMeetingFeedbackModal
                    meeting={meetingToEnd}
                    currentUser={currentUser}
                    onClose={() => {
                        setEndOpen(false);
                        setMeetingToEnd(null);
                    }}
                    onSuccess={() => {
                        setEndOpen(false);
                        setMeetingToEnd(null);
                        fetchData();
                        toast.success(t('meetings.endedFeedbackSaved'));
                    }}
                />
            )}
        </div>
    );
}

interface CreateMeetingModalProps {
    isOpen: boolean;
    onClose: () => void;
    qualifiedLeads: any[];
    initialLeadId?: string;
    isManager?: boolean;
    allSales?: any[];
    onSuccess: () => void;
}

function CreateMeetingModal({
    isOpen,
    onClose,
    qualifiedLeads,
    initialLeadId,
    isManager,
    allSales = [],
    onSuccess,
}: CreateMeetingModalProps) {
    const { t } = useTranslation();
    const [leadId, setLeadId] = useState<string>('');
    const [leadSearch, setLeadSearch] = useState('');
    const [leadOptions, setLeadOptions] = useState<any[]>([]);
    const [leadSearchLoading, setLeadSearchLoading] = useState(false);
    const [meetingDate, setMeetingDate] = useState('');
    const [meetingTime, setMeetingTime] = useState('12:00');
    const [meetingType, setMeetingType] = useState('other');
    const [location, setLocation] = useState('');
    const [scheduledBy, setScheduledBy] = useState<string>('');
    const [agentSearch, setAgentSearch] = useState('');
    const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const leadLabel = (l: any) => `${l?.firstName ?? ''} ${l?.lastName ?? ''}`.trim();
    const meetingTypes = useMemo(() => getMeetingTypes(t), [t]);
    const runLeadSearch = useCallback(async (rawQuery: string) => {
        const q = rawQuery.trim();
        setLeadSearchLoading(true);
        try {
            const res = await getAllLeads(1, 20, {
                search: q || undefined,
                q: q || undefined,
                excludeRotation: true,
            });
            const rows = Array.isArray(res?.data) ? res.data : [];
            setLeadOptions(rows);
        } catch {
            setLeadOptions([]);
        } finally {
            setLeadSearchLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            const defaultLeadId = initialLeadId ?? '';
            setLeadId(defaultLeadId);
            const defaultLead = qualifiedLeads.find((l) => String(l.id) === String(defaultLeadId));
            setLeadSearch(defaultLead ? `${leadLabel(defaultLead)}${defaultLead?.phone ? ` — ${defaultLead.phone}` : ''}` : '');
            setLeadOptions(qualifiedLeads);
            const d = new Date();
            setMeetingDate(d.toISOString().slice(0, 10));
            setMeetingTime('12:00');
            setMeetingType('other');
            setLocation('');
            setScheduledBy('');
            setAgentSearch('');
        }
    }, [isOpen, qualifiedLeads, initialLeadId]);

    // Auto-update scheduledBy when lead changes (for managers)
    useEffect(() => {
        if (isManager && leadId) {
            const currentLead = leadOptions.find(l => String(l.id) === String(leadId));
            if (currentLead?.assignedTo) {
                setScheduledBy(String(currentLead.assignedTo));
                const assignee = allSales.find(s => String(s.id) === String(currentLead.assignedTo));
                if (assignee) {
                    setAgentSearch(`${assignee.firstName} ${assignee.lastName}`);
                }
            }
        }
    }, [leadId, isManager, leadOptions]);

    const lead = useMemo(
        () => qualifiedLeads.find((l) => String(l.id) === leadId),
        [qualifiedLeads, leadId],
    );
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (cancelled) return;
            await runLeadSearch(leadSearch);
        }, 300);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isOpen, leadSearch, runLeadSearch]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!leadId) {
            toast.error(t('meetings.selectLead'));
            return;
        }
        const dateTime = `${meetingDate}T${meetingTime}:00`;
        const scheduledAtMs = new Date(dateTime).getTime();
        if (!Number.isFinite(scheduledAtMs)) {
            toast.error(t('meetings.invalidDateTime', { defaultValue: 'Please select a valid date and time' }));
            return;
        }

        setSubmitting(true);
        try {
            // Do not allow scheduling before lead assignment datetime.
            let assignmentAtMs: number | null = null;
            try {
                const fullLead = await getLeadById(Number(leadId));
                const assignmentTimes: number[] = [];
                if (Array.isArray(fullLead?.assignments)) {
                    for (const a of fullLead.assignments) {
                        const ts = new Date(String(a?.assignedAt ?? '')).getTime();
                        if (Number.isFinite(ts)) assignmentTimes.push(ts);
                    }
                }
                const directAssignedAt = new Date(String(fullLead?.assignedAt ?? '')).getTime();
                if (Number.isFinite(directAssignedAt)) assignmentTimes.push(directAssignedAt);
                assignmentAtMs = assignmentTimes.length > 0 ? Math.max(...assignmentTimes) : null;
            } catch {
                // continue and let backend decide if lead details request fails
            }

            if (assignmentAtMs != null && scheduledAtMs < assignmentAtMs) {
                toast.error(
                    t('meetings.assignmentTimeGuard', {
                        defaultValue: 'Meeting date/time cannot be before lead assignment time',
                    }),
                );
                return;
            }

            await createMeeting({
                leadId: Number(leadId),
                meetingDate: dateTime,
                location: location.trim() || undefined,
                meetingType,
                scheduledBy: scheduledBy ? Number(scheduledBy) : undefined,
            });
            toast.success(t('meetings.meetingScheduled'));
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || t('meetings.failedCreate'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const scheduleIcon = (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#BF9B30]/40 bg-[#BF9B30]/18 text-[#0B1828] shadow-sm">
            <CalendarPlus className="h-6 w-6" aria-hidden />
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('leadDetail.modals.scheduleTitle', {
                name: lead ? `${lead.firstName ?? ''} ${lead.lastName ?? ''}`.trim() : t('leadDetail.leadSystemFallback', { defaultValue: 'Lead' }),
            })}
            subtitle={t('leadDetail.modals.scheduleSubtitle', { defaultValue: 'SCHEDULE NEW APPOINTMENT' })}
            headerIcon={scheduleIcon}
            size="xl"
        >
            <form onSubmit={handleSubmit} className="animate-in space-y-6 fade-in slide-in-from-bottom-2 duration-300">
                <p className="mb-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                    {t('leadDetail.modals.scheduleDesc')}
                </p>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <label className="modal-label">{t('meetings.selectClient')} *</label>
                        <input
                            type="text"
                            value={leadSearch}
                            onChange={(e) => {
                                setLeadSearch(e.target.value);
                                setLeadId('');
                            }}
                            onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                e.preventDefault();
                                const first = leadOptions[0];
                                if (!first) return;
                                setLeadId(String(first.id));
                                setLeadSearch(`${leadLabel(first)}${first?.phone ? ` — ${first.phone}` : ''}`);
                            }}
                            placeholder={t('meetings.searchLeadPlaceholder', {
                                defaultValue: 'Search lead by name, phone, or email',
                            })}
                            className="modal-input mb-2"
                        />
                        {leadId ? (
                            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                                {t('meetings.selectedLead', { defaultValue: 'Selected lead' })}: {leadSearch}
                            </p>
                        ) : (
                            <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                                {leadSearchLoading ? (
                                    <div className="px-3 py-2 text-xs font-bold text-slate-500">
                                        {t('meetings.loading')}
                                    </div>
                                ) : null}
                                {!leadSearchLoading && leadOptions.slice(0, 20).map((l) => (
                                    <button
                                        key={String(l.id)}
                                        type="button"
                                        onClick={() => {
                                            setLeadId(String(l.id));
                                            setLeadSearch(`${leadLabel(l)}${l?.phone ? ` — ${l.phone}` : ''}`);
                                        }}
                                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-bold text-[#0B1828] transition-colors hover:bg-[#0B1828] hover:text-white"
                                    >
                                        <span>{leadLabel(l)}</span>
                                        <span className="text-xs opacity-80" dir="ltr">{l?.phone || l?.email || ''}</span>
                                    </button>
                                ))}
                                {!leadSearchLoading && leadOptions.length === 0 ? (
                                    <div className="px-2 py-2 text-xs font-bold text-slate-500">
                                        {t('meetings.noLeadsFound', { defaultValue: 'No matching leads found' })}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="modal-label">{t('meetings.date')} *</label>
                        <div className="relative">
                            <Calendar className="modal-input-icon start-4 z-10" />
                            <input
                                type="date"
                                value={meetingDate}
                                onChange={(e) => setMeetingDate(e.target.value)}
                                className="modal-input ps-12"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="modal-label">{t('meetings.time')} *</label>
                        <div className="relative">
                            <Clock className="modal-input-icon start-4 z-10" />
                            <input
                                type="time"
                                value={meetingTime}
                                onChange={(e) => setMeetingTime(e.target.value)}
                                className="modal-input ps-12"
                                required
                            />
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="modal-label">{t('meetings.meetingType')}</label>
                        <div className="flex flex-wrap gap-2" role="group" aria-label={t('meetings.meetingType')}>
                            {meetingTypes.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setMeetingType(opt.value)}
                                    className={cn(
                                        'modal-pill flex-1 min-w-[6.5rem] sm:flex-none',
                                        meetingType === opt.value ? 'modal-pill-active' : 'modal-pill-idle',
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isManager && (
                        <div className="md:col-span-2">
                            <label className="modal-label">{t('meetings.scheduledFor', { defaultValue: 'Schedule For (Agent)' })} *</label>
                            <div className="relative">
                                <Users className="pointer-events-none absolute start-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#0B1828]/25" />
                                <input
                                    type="text"
                                    value={agentSearch}
                                    onChange={(e) => {
                                        setAgentSearch(e.target.value);
                                        setScheduledBy('');
                                    }}
                                    onFocus={() => setIsAgentDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setIsAgentDropdownOpen(false), 200)}
                                    placeholder={t('meetings.selectAgent', { defaultValue: 'Search Agent...' })}
                                    className="modal-input ps-11 font-bold"
                                />
                                {isAgentDropdownOpen && (
                                    <div className="absolute top-full mt-2 z-50 w-full max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-2xl">
                                        {allSales.filter((s: any) =>
                                            (s.firstName || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
                                            (s.lastName || '').toLowerCase().includes(agentSearch.toLowerCase())
                                        ).map((s: any) => (
                                            <button
                                                key={String(s.id)}
                                                type="button"
                                                onClick={() => {
                                                    setScheduledBy(String(s.id));
                                                    setAgentSearch(`${s.firstName} ${s.lastName}`);
                                                    setIsAgentDropdownOpen(false);
                                                }}
                                                className="flex w-full items-center px-3 py-2 text-left text-sm font-bold text-[#0B1828] hover:bg-[#0B1828] hover:text-white rounded-xl transition-colors"
                                            >
                                                {s.firstName} {s.lastName}
                                            </button>
                                        ))}
                                        {allSales.filter((s: any) =>
                                            (s.firstName || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
                                            (s.lastName || '').toLowerCase().includes(agentSearch.toLowerCase())
                                        ).length === 0 && (
                                                <div className="px-3 py-2 text-xs font-bold text-slate-500">
                                                    {t('meetings.noAgentsFound', { defaultValue: 'No agents found' })}
                                                </div>
                                            )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                <div>
                    <label className="modal-label">{t('leadDetail.modals.locationOptional')}</label>
                    <div className="relative">
                        <MapPin className="modal-input-icon start-4 text-[#0B1828]/40" />
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder={t('leadDetail.modals.addressVenue')}
                            className="modal-input min-h-[3.5rem] ps-12 font-bold"
                        />
                    </div>
                </div>

                <div className="modal-actions-stack">
                    <button type="submit" disabled={submitting} className="modal-btn-primary">
                        {submitting ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                <Check className="h-5 w-5 shrink-0" aria-hidden />
                                <Calendar className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                            </>
                        )}
                        {t('meetings.confirmSchedule')}
                    </button>
                    <button type="button" onClick={onClose} className="modal-cancel-link">
                        {t('common.cancel')}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

