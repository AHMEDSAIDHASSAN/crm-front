import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
    LogIn,
    LogOut,
    Loader2,
    MapPin,
    Clock,
    Calendar,
    CheckCircle2,
    Play,
    Square,
    AlertTriangle,
    Timer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { toast } from '../lib/toast';
import {
    checkInAttendance,
    checkOutAttendance,
    getTodayAttendanceForUser,
    getActiveHrPolicy,
    getMeetings,
    updateMeeting,
} from '../services/api';
import { getMeetingGpsPosition, coordsToMeetingString } from '../utils/meetingGeolocation';
import EndMeetingFeedbackModal from '../components/meetings/EndMeetingFeedbackModal';

function formatTime(iso: string | null | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string | null | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function meetingStatusForActions(status: string | undefined, startedAt?: string | null) {
    const s = String(status || '');
    if (s === 'checkin') return startedAt ? 'in_progress' : 'scheduled';
    if (s === 'checkout') return 'completed';
    return s;
}

function isTodayMeeting(dateStr: string) {
    const today = new Date();
    const d = new Date(dateStr);
    return (
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
    );
}

export default function Attendance() {
    const { t } = useTranslation();
    const currentUser = useSelector((state: any) => state.user.user);

    const [todayRecord, setTodayRecord] = useState<any>(null);
    const [loadingRecord, setLoadingRecord] = useState(true);
    const [checkingIn, setCheckingIn] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);

    const [activeShift, setActiveShift] = useState<any>(null);

    const [todayMeetings, setTodayMeetings] = useState<any[]>([]);
    const [loadingMeetings, setLoadingMeetings] = useState(true);
    const [startingId, setStartingId] = useState<number | null>(null);
    const [endOpen, setEndOpen] = useState(false);
    const [meetingToEnd, setMeetingToEnd] = useState<any>(null);

    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const loadTodayRecord = useCallback(async () => {
        if (!currentUser?.id) return;
        setLoadingRecord(true);
        try {
            const record = await getTodayAttendanceForUser(currentUser.id);
            setTodayRecord(record ?? null);
        } catch {
            setTodayRecord(null);
        } finally {
            setLoadingRecord(false);
        }
    }, [currentUser?.id]);

    const loadTodayMeetings = useCallback(async () => {
        setLoadingMeetings(true);
        try {
            const res = await getMeetings(1, 50);
            const all: any[] = Array.isArray(res?.data) ? res.data : [];
            setTodayMeetings(all.filter((m) => m.meetingDate && isTodayMeeting(m.meetingDate)));
        } catch {
            setTodayMeetings([]);
        } finally {
            setLoadingMeetings(false);
        }
    }, []);

    useEffect(() => {
        loadTodayRecord();
        loadTodayMeetings();
        getActiveHrPolicy().then(p => setActiveShift(p)).catch(() => {});
    }, []);

    const handleCheckIn = async () => {
        setCheckingIn(true);
        const toastId = 'attendance-checkin-geo';
        toast.loading(t('attendance.gettingLocation'), { id: toastId });
        try {
            const pos = await getMeetingGpsPosition();
            toast.dismiss(toastId);
            const checkInLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
            await checkInAttendance({ checkInLocation });
            toast.success(t('attendance.checkedIn'));
            loadTodayRecord();
        } catch (e: any) {
            toast.dismiss(toastId);
            if (e?.code === 1) { toast.error(t('attendance.locationDenied')); return; }
            if (e?.code === 2) { toast.error(t('attendance.locationUnavailable')); return; }
            if (e?.code === 3) { toast.error(t('attendance.locationTimeout')); return; }
            toast.error(e?.response?.data?.message || t('attendance.checkInFailed'));
        } finally {
            toast.dismiss(toastId);
            setCheckingIn(false);
        }
    };

    const handleCheckOut = async () => {
        setCheckingOut(true);
        const toastId = 'attendance-checkout-geo';
        toast.loading(t('attendance.gettingLocation'), { id: toastId });
        try {
            const pos = await getMeetingGpsPosition();
            toast.dismiss(toastId);
            const checkOutLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
            await checkOutAttendance({ checkOutLocation });
            toast.success(t('attendance.checkedOut'));
            loadTodayRecord();
        } catch (e: any) {
            toast.dismiss(toastId);
            if (e?.code === 1) { toast.error(t('attendance.locationDenied')); return; }
            if (e?.code === 2) { toast.error(t('attendance.locationUnavailable')); return; }
            if (e?.code === 3) { toast.error(t('attendance.locationTimeout')); return; }
            toast.error(e?.response?.data?.message || t('attendance.checkOutFailed'));
        } finally {
            toast.dismiss(toastId);
            setCheckingOut(false);
        }
    };

    const handleStartMeeting = async (meeting: any) => {
        const id = Number(meeting.id);
        setStartingId(id);
        const toastId = 'meeting-checkin-geo';
        toast.info(t('meetings.gettingLocation'), { toastId, autoClose: 4000 });
        try {
            const pos = await getMeetingGpsPosition();
            const currentLocation = coordsToMeetingString(pos.coords.latitude, pos.coords.longitude);
            toast.dismiss(toastId);
            await updateMeeting(id, {
                status: 'in_progress',
                startedAt: new Date().toISOString(),
                currentLocation,
            });
            toast.success(t('meetings.startedWithLocation'));
            loadTodayMeetings();
        } catch (e: any) {
            toast.dismiss(toastId);
            const geoCode = e?.code;
            if (geoCode === 1) { toast.error(t('meetings.locationPermissionDenied')); return; }
            if (geoCode === 2) { toast.error(t('meetings.locationUnavailable')); return; }
            if (geoCode === 3) { toast.error(t('meetings.locationTimedOut')); return; }
            toast.error(e?.response?.data?.message || t('meetings.failedStart'));
        } finally {
            toast.dismiss(toastId);
            setStartingId(null);
        }
    };

    const checkedIn = Boolean(todayRecord?.checkInTime);
    const checkedOut = Boolean(todayRecord?.checkOutTime);
    const canCheckIn = !checkedIn;
    const canCheckOut = checkedIn && !checkedOut;

    const todayLabel = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <div className="min-h-screen bg-sira-bg-page p-3 sm:p-4 md:p-10 space-y-6 md:space-y-10">
            {/* Header */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <div className="h-7 w-1.5 rounded-full bg-sira-gold md:h-8" />
                    <h1 className="text-[24px] font-black uppercase leading-none tracking-tight text-sira-text-primary sm:text-[28px] lg:text-[40px]">
                        {t('attendance.title')}
                    </h1>
                </div>
                <p className="pl-4 text-[9px] font-black uppercase tracking-[0.22em] text-sira-text-muted sm:text-[10px] sm:tracking-[0.4em]">
                    {t('attendance.subtitle')}
                </p>
            </div>

            {/* Live Clock + Shift Card */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-6 shadow-premium md:rounded-[32px] md:p-8">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-sira-gold/5 rounded-bl-[160px]" />
                    <div className="relative flex flex-col gap-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sira-text-muted">{todayLabel}</p>
                        <p className="text-[32px] font-black tabular-nums tracking-tight text-sira-text-primary sm:text-[42px]">{timeLabel}</p>
                    </div>
                </div>
                {activeShift ? (
                    <div className="relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-6 shadow-premium md:rounded-[32px] md:p-8">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-sira-brown/5 rounded-bl-[120px]" />
                        <div className="relative space-y-3">
                            <div className="flex items-center gap-2">
                                <Timer className="h-4 w-4 text-sira-brown" />
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted">{t('attendance.activeShift')}</p>
                            </div>
                            <p className="text-[15px] font-black text-sira-text-primary uppercase tracking-tight truncate">{activeShift.name}</p>
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-sira-green" />
                                    <span className="text-[12px] font-black text-sira-green tabular-nums">{activeShift.shiftStartTime}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-red-500" />
                                    <span className="text-[12px] font-black text-red-500 tabular-nums">{activeShift.shiftEndTime}</span>
                                </div>
                                {activeShift.graceMinutes > 0 && (
                                    <span className="text-[10px] font-bold text-sira-text-muted bg-sira-bg-subtle px-2 py-0.5 rounded-lg">
                                        {t('attendance.grace')} {activeShift.graceMinutes}{t('attendance.min')}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-3xl border border-dashed border-sira-border bg-sira-bg-subtle p-6 flex items-center justify-center md:rounded-[32px]">
                        <p className="text-[11px] font-bold text-sira-text-muted uppercase tracking-widest">{t('attendance.noShift')}</p>
                    </div>
                )}
            </div>

            {/* Today's Attendance Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Check-In Status */}
                <div className={cn(
                    "relative overflow-hidden rounded-3xl border p-6 shadow-premium transition-all md:rounded-[32px] md:p-8",
                    checkedIn
                        ? "border-sira-green/40 bg-sira-green/5"
                        : "border-sira-border bg-sira-bg-card"
                )}>
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                            checkedIn ? "bg-sira-green/20 text-sira-green" : "bg-sira-bg-subtle text-sira-text-muted"
                        )}>
                            <LogIn className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-1">
                                {t('attendance.checkIn')}
                            </p>
                            {loadingRecord ? (
                                <Loader2 className="h-5 w-5 animate-spin text-sira-text-muted" />
                            ) : checkedIn ? (
                                <div>
                                    <p className="text-[22px] font-black tabular-nums text-sira-green tracking-tight">
                                        {formatTime(todayRecord?.checkInTime)}
                                    </p>
                                    {todayRecord?.isLate && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                            <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">
                                                {t('attendance.late')} {todayRecord.lateMinutes}{t('attendance.min')}
                                            </span>
                                        </div>
                                    )}
                                    {todayRecord?.checkInLocation && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <MapPin className="h-3 w-3 text-sira-green/60" />
                                            <span className="text-[10px] font-bold text-sira-text-muted">
                                                {todayRecord.checkInLocation}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[13px] font-bold text-sira-text-muted uppercase tracking-wide">
                                    {t('attendance.notYet')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Check-Out Status */}
                <div className={cn(
                    "relative overflow-hidden rounded-3xl border p-6 shadow-premium transition-all md:rounded-[32px] md:p-8",
                    checkedOut
                        ? "border-red-400/40 bg-red-50/50"
                        : "border-sira-border bg-sira-bg-card"
                )}>
                    <div className="flex items-start gap-4">
                        <div className={cn(
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                            checkedOut ? "bg-red-100 text-red-500" : "bg-sira-bg-subtle text-sira-text-muted"
                        )}>
                            <LogOut className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-sira-text-muted mb-1">
                                {t('attendance.checkOut')}
                            </p>
                            {loadingRecord ? (
                                <Loader2 className="h-5 w-5 animate-spin text-sira-text-muted" />
                            ) : checkedOut ? (
                                <div>
                                    <p className="text-[22px] font-black tabular-nums text-red-500 tracking-tight">
                                        {formatTime(todayRecord?.checkOutTime)}
                                    </p>
                                    {todayRecord?.checkOutLocation && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <MapPin className="h-3 w-3 text-red-400" />
                                            <span className="text-[10px] font-bold text-sira-text-muted">
                                                {todayRecord.checkOutLocation}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-[13px] font-bold text-sira-text-muted uppercase tracking-wide">
                                    {t('attendance.notYet')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Check In Button */}
                <button
                    onClick={handleCheckIn}
                    disabled={!canCheckIn || checkingIn}
                    className={cn(
                        "group relative flex h-20 w-full items-center justify-center gap-3 overflow-hidden rounded-3xl border-b-4 text-[13px] font-black uppercase tracking-[0.15em] shadow-premium transition-all active:translate-y-1 disabled:opacity-40 disabled:cursor-not-allowed md:h-24 md:text-[14px]",
                        canCheckIn
                            ? "border-black/15 bg-sira-green text-white hover:brightness-105"
                            : "border-transparent bg-sira-bg-subtle text-sira-text-muted"
                    )}
                >
                    {checkingIn ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                    ) : checkedIn ? (
                        <CheckCircle2 className="h-6 w-6" />
                    ) : (
                        <LogIn className="h-6 w-6 transition-transform group-hover:scale-110" />
                    )}
                    {checkedIn ? t('attendance.alreadyCheckedIn') : t('attendance.checkInBtn')}
                </button>

                {/* Check Out Button */}
                <button
                    onClick={handleCheckOut}
                    disabled={!canCheckOut || checkingOut}
                    className={cn(
                        "group relative flex h-20 w-full items-center justify-center gap-3 overflow-hidden rounded-3xl border-b-4 text-[13px] font-black uppercase tracking-[0.15em] shadow-premium transition-all active:translate-y-1 disabled:opacity-40 disabled:cursor-not-allowed md:h-24 md:text-[14px]",
                        canCheckOut
                            ? "border-black/15 bg-sira-brown text-white hover:bg-sira-brown-dark"
                            : "border-transparent bg-sira-bg-subtle text-sira-text-muted"
                    )}
                >
                    {checkingOut ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                    ) : checkedOut ? (
                        <CheckCircle2 className="h-6 w-6" />
                    ) : (
                        <LogOut className="h-6 w-6 transition-transform group-hover:scale-110" />
                    )}
                    {checkedOut ? t('attendance.alreadyCheckedOut') : t('attendance.checkOutBtn')}
                </button>
            </div>

            {/* Location note */}
            <div className="flex items-start gap-3 rounded-2xl border border-sira-border/60 bg-sira-bg-subtle px-5 py-4">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-sira-gold" />
                <p className="text-[11px] font-bold text-sira-text-muted leading-relaxed">
                    {t('attendance.locationNote')}
                </p>
            </div>

            {/* Today's Meetings */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-1 rounded-full bg-sira-gold" />
                    <h2 className="text-[13px] font-black uppercase tracking-[0.2em] text-sira-text-primary">
                        {t('attendance.todayMeetings')}
                    </h2>
                </div>

                {loadingMeetings ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-sira-brown" />
                    </div>
                ) : todayMeetings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 rounded-3xl border-2 border-dashed border-sira-border">
                        <Calendar className="h-12 w-12 text-sira-brown/20 mb-4" />
                        <p className="text-[12px] font-black uppercase tracking-[0.25em] text-sira-text-muted">
                            {t('attendance.noMeetingsToday')}
                        </p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        <div className="grid gap-4">
                            {todayMeetings.map((m) => {
                                const lead = m.lead;
                                const actionStatus = meetingStatusForActions(m.status, m.startedAt);
                                const isScheduled = actionStatus === 'scheduled';
                                const isInProgress = actionStatus === 'in_progress';
                                const isCompleted = actionStatus === 'completed';
                                const starting = startingId === Number(m.id);

                                return (
                                    <motion.div
                                        key={String(m.id)}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        className="group relative overflow-hidden rounded-3xl border border-sira-border bg-sira-bg-card p-5 shadow-premium transition-all md:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8"
                                    >
                                        {/* Status accent */}
                                        <div className={cn(
                                            "absolute top-0 bottom-0 left-0 w-2.5 rounded-r-none",
                                            isCompleted ? "bg-sira-green" :
                                                isInProgress ? "bg-sira-gold" :
                                                    m.status === 'no_show' ? "bg-red-500" : "bg-sira-brown/40"
                                        )} />

                                        <div className="flex items-start gap-4 pl-4">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sira-bg-subtle text-sira-brown shadow-inner">
                                                <Calendar className="h-6 w-6" />
                                            </div>
                                            <div className="space-y-1.5">
                                                <h3 className="text-[16px] font-black uppercase tracking-tight text-sira-text-primary">
                                                    {lead?.firstName} {lead?.lastName}
                                                </h3>
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className={cn(
                                                        "px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest",
                                                        isCompleted ? "bg-sira-green/10 text-sira-green border border-sira-green/30" :
                                                            isInProgress ? "bg-sira-gold/10 text-sira-gold border border-sira-gold/20" :
                                                                "bg-sira-brown/10 text-sira-brown border border-sira-brown/20"
                                                    )}>
                                                        {isCompleted ? t('meetings.status.completed') :
                                                            isInProgress ? t('meetings.status.in_progress') :
                                                                t('meetings.status.scheduled')}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-sira-text-muted">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        {formatDate(m.meetingDate)}
                                                    </div>
                                                </div>
                                                {m.location && (
                                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-sira-text-muted">
                                                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="truncate max-w-[240px]">{m.location}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center gap-3 pl-4 lg:mt-0 lg:pl-0 lg:shrink-0">
                                            {isScheduled && (
                                                <button
                                                    onClick={() => handleStartMeeting(m)}
                                                    disabled={starting}
                                                    className="flex h-11 items-center gap-2 rounded-2xl border-b-4 border-black/10 bg-sira-green px-5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-premium transition-all hover:brightness-110 active:translate-y-1 disabled:opacity-50"
                                                >
                                                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                                                    {t('meetings.beginMeeting')}
                                                </button>
                                            )}
                                            {isInProgress && (
                                                <button
                                                    onClick={() => { setMeetingToEnd(m); setEndOpen(true); }}
                                                    className="flex h-11 items-center gap-2 rounded-2xl border-b-4 border-black/10 bg-sira-brown px-5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-premium transition-all hover:bg-sira-brown-dark active:translate-y-1"
                                                >
                                                    <Square className="h-4 w-4 fill-current" />
                                                    {t('meetings.endMeeting')}
                                                </button>
                                            )}
                                            {isCompleted && (
                                                <div className="flex items-center gap-2 text-sira-green">
                                                    <CheckCircle2 className="h-5 w-5" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{t('meetings.status.completed')}</span>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </AnimatePresence>
                )}
            </div>

            {/* End Meeting Modal */}
            {endOpen && meetingToEnd && (
                <EndMeetingFeedbackModal
                    meeting={meetingToEnd}
                    currentUser={currentUser}
                    onClose={() => { setEndOpen(false); setMeetingToEnd(null); }}
                    onSuccess={() => {
                        setEndOpen(false);
                        setMeetingToEnd(null);
                        loadTodayMeetings();
                        toast.success(t('meetings.endedFeedbackSaved'));
                    }}
                />
            )}
        </div>
    );
}
