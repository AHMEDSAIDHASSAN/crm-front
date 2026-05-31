import { Bell, BellOff, Check, CheckCheck, ChevronRight, LayoutDashboard, Menu, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { toast } from '../../lib/toast';
import { useSocket } from '../../hooks/useSocket';
import { useNotificationSound, isSoundEnabled, setSoundEnabled } from '../../hooks/useNotificationSound';
import {
    getNotificationsForUser,
    getUnreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
} from '../../services/api';
import { getPageMeta } from '../../lib/pageMeta';
import { emitUnitPreviewActivity } from '../../lib/unitPreviewRealtime';
import { isAppRtl } from '../../lib/i18nDirection';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

type Notification = {
    id: string;
    notificationType: string;
    title: string;
    message: string | null;
    isRead: boolean;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    createdAt: string;
};

type HeaderProps = {
    mobileSidebarOpen?: boolean;
    onToggleMobile?: () => void;
};

function HeaderComponent({ mobileSidebarOpen = false, onToggleMobile }: HeaderProps) {
    const { t, i18n } = useTranslation();
    const user = useSelector((state: any) => state.user.user);
    const navigate = useNavigate();
    const location = useLocation();
    const isRtl = isAppRtl(i18n);
    const { title } = getPageMeta(location.pathname, user);

    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const notifRef = useRef<HTMLDivElement>(null);
    const notifPanelRef = useRef<HTMLDivElement>(null);
    const notifButtonRef = useRef<HTMLButtonElement>(null);
    const [notifPanelStyle, setNotifPanelStyle] = useState<CSSProperties>({});

    const userId = user?.id;
    const { play: playSound } = useNotificationSound();
    const [soundOn, setSoundOn] = useState(isSoundEnabled());

    const toggleSound = () => {
        const next = !soundOn;
        setSoundOn(next);
        setSoundEnabled(next);
        if (next) playSound('assigned'); // preview
    };

    const handleNewNotification = useCallback(
        (payload: Notification) => {
            setNotifications((prev) => [payload, ...prev].slice(0, 50));
            if (userId != null && userId !== '') {
                getUnreadNotificationCount(userId)
                    .then((r) => setUnreadCount(Number(r.count) || 0))
                    .catch(() => setUnreadCount((c) => c + 1));
            } else {
                setUnreadCount((c) => c + 1);
            }
            toast.info(payload.title, { autoClose: 4000 });

            // Play sound based on notification type
            const t = payload.notificationType;
            if (t === 'lead_assigned') playSound('assigned');
            else if (t === 'lead_retracted') playSound('retracted');

            const rel = payload.relatedEntityType;
            if (rel === 'unit_preview' || rel === 'unit') {
                emitUnitPreviewActivity();
            }
        },
        [userId, playSound],
    );

    useSocket(handleNewNotification, user?.id);

    useEffect(() => {
        if (!userId) return;
        getUnreadNotificationCount(userId)
            .then((r) => setUnreadCount(r.count))
            .catch(() => { });
    }, [userId]);

    useEffect(() => {
        if (!notifOpen || !userId) return;
        getNotificationsForUser(userId)
            .then((data: any) => {
                const list = Array.isArray(data) ? data : data?.data ?? [];
                setNotifications(
                    list.map((n: any) => ({
                        ...n,
                        id: String(n.id),
                        relatedEntityId: n.relatedEntityId ? String(n.relatedEntityId) : null,
                    })),
                );
            })
            .catch(() => { });
    }, [notifOpen, userId]);

    const formatNotifTime = useCallback(
        (dateStr: string) => {
            const diff = Date.now() - new Date(dateStr).getTime();
            const mins = Math.floor(diff / 60000);
            if (mins < 1) return t('header.time.justNow');
            if (mins < 60) return t('header.time.minutesAgo', { count: mins });
            const hrs = Math.floor(mins / 60);
            if (hrs < 24) return t('header.time.hoursAgo', { count: hrs });
            const days = Math.floor(hrs / 24);
            return t('header.time.daysAgo', { count: days });
        },
        [t],
    );

    const handleMarkRead = async (n: Notification) => {
        if (n.isRead) return;
        try {
            await markNotificationRead(n.id);
            setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch { }
    };

    const handleMarkAllRead = async () => {
        if (!userId) return;
        try {
            await markAllNotificationsRead(userId);
            setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })));
            setUnreadCount(0);
        } catch { }
    };

    const handleNotificationClick = (n: Notification) => {
        handleMarkRead(n);
        setNotifOpen(false);
        if (n.relatedEntityType === 'lead' && n.relatedEntityId) {
            navigate('/leads');
        } else if (n.relatedEntityType === 'unit' || n.relatedEntityType === 'unit_preview') {
            navigate('/units');
        }
    };

    useEffect(() => {
        const close = (e: MouseEvent) => {
            const t = e.target as Node;
            if (notifRef.current?.contains(t) || notifPanelRef.current?.contains(t)) return;
            setNotifOpen(false);
        };
        if (notifOpen) document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [notifOpen]);

    useEffect(() => {
        setNotifOpen(false);
    }, [location.pathname]);

    const updateNotifPanelPosition = useCallback(() => {
        const btn = notifButtonRef.current;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const isMobile = window.innerWidth < 640;
        if (isMobile) {
            setNotifPanelStyle({
                position: 'fixed',
                top: r.bottom + 8,
                left: 8,
                right: 8,
                width: 'auto',
                zIndex: 5000,
            });
            return;
        }
        const panelW = Math.min(384, window.innerWidth - 32);
        const rtl = isAppRtl(i18n);
        const top = r.bottom + 8;
        const left = rtl
            ? Math.max(16, Math.min(r.left, window.innerWidth - panelW - 16))
            : Math.max(16, Math.min(r.right - panelW, window.innerWidth - panelW - 16));
        setNotifPanelStyle({
            position: 'fixed',
            top,
            left,
            width: panelW,
            right: 'auto',
            zIndex: 5000,
        });
    }, [i18n]);

    useLayoutEffect(() => {
        if (!notifOpen) return;
        updateNotifPanelPosition();
        const onResize = () => updateNotifPanelPosition();
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onResize, true);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onResize, true);
        };
    }, [notifOpen, updateNotifPanelPosition, i18n.language]);

    const getBreadcrumbs = (): { label: string; path: string; icon?: LucideIcon }[] => {
        const paths = location.pathname.split('/').filter(Boolean);
        const crumbs: { label: string; path: string; icon?: LucideIcon }[] = [
            { label: t('sidebar.dashboard'), path: '/dashboard', icon: LayoutDashboard },
        ];

        paths.forEach((p, i) => {
            const path = `/${paths.slice(0, i + 1).join('/')}`;
            let label = p;

            if (p === 'leads') label = t('sidebar.leads');
            else if (p === 'units') label = t('sidebar.units');
            else if (p === 'meetings') label = t('sidebar.meetings');
            else if (p === 'performance') label = t('sidebar.performance');
            else if (p === 'calculator') label = t('sidebar.calculator');
            else if (p === 'brokerage') label = t('sidebar.agentsTeams');
            else if (i === paths.length - 1) label = title;

            crumbs.push({ label, path });
        });

        return crumbs;
    };

    const crumbs = getBreadcrumbs();

    return (
        <header className="sticky top-0 z-[80] shrink-0 px-2 pt-2 md:px-3">
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/98 shadow-sm backdrop-blur-sm sm:rounded-[1.6rem]">

            {/* Single unified row — mobile: [menu][breadcrumb][bell+avatar], desktop: two rows */}

            {/* Mobile single row */}
            <div className="flex h-13 items-center gap-2 px-3 py-2 md:hidden">
                <button
                    type="button"
                    onClick={onToggleMobile}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0B1828] shadow-sm active:scale-95"
                    aria-label={t('sidebar.menu')}
                >
                    {mobileSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>

                {/* Current page pill */}
                <div className="min-w-0 flex-1">
                    <span className="block truncate rounded-xl bg-[#0B1828] px-3 py-1.5 text-center text-[11px] font-black uppercase tracking-wide text-white">
                        {crumbs[crumbs.length - 1]?.label ?? 'SIRA'}
                    </span>
                </div>

                <div className="flex shrink-0 items-center gap-2" ref={notifRef}>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[9px] font-black text-[#0B1828]">
                        {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </div>
                    <button
                        ref={notifButtonRef}
                        type="button"
                        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm"
                        onClick={() => setNotifOpen((o) => !o)}
                    >
                        {soundOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4 text-slate-400" />}
                        {unreadCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Desktop two-row layout */}
            <div className="hidden md:block">
            {/* Top Branding Bar */}
            <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4 md:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full bg-[#0B1828] px-3.5 py-1.5 text-white shadow-sm ring-1 ring-slate-200/20">
                        <span className="text-[11px] font-black tracking-tight">SIRA</span>
                        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                        {t('header.serverConnected')}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[10px] font-black text-[#0B1828]">
                        {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </div>
                </div>
            </div>

            {/* Breadcrumbs Row */}
            <div className="flex h-14 items-center justify-between px-8">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <nav className="no-scrollbar flex items-center gap-2 overflow-x-auto py-2">
                        {crumbs.map((crumb, i) => (
                            <div key={crumb.path} className="flex shrink-0 items-center gap-2">
                                <button
                                    onClick={() => navigate(crumb.path)}
                                    className={cn(
                                        'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider transition-colors',
                                        i === crumbs.length - 1
                                            ? 'bg-[#0B1828] text-white shadow-md shadow-[#0B1828]/15'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-[#0B1828]'
                                    )}
                                >
                                    {crumb.icon && <crumb.icon className="h-3.5 w-3.5" />}
                                    {crumb.label}
                                </button>
                                {i < crumbs.length - 1 && (
                                    <ChevronRight className={cn('h-4 w-4 text-slate-300', isRtl && 'rotate-180')} />
                                )}
                            </div>
                        ))}
                    </nav>
                </div>

                <div className="flex shrink-0 items-center gap-4" ref={notifRef}>
                     <button
                        ref={notifButtonRef}
                        type="button"
                        className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-[#BF9B30] hover:text-[#0B1828]"
                        aria-label={t('header.notifications')}
                        onClick={() => setNotifOpen((o) => !o)}
                    >
                        {soundOn ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5 text-slate-400" />}
                        {unreadCount > 0 && (
                            <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {notifOpen &&
                        createPortal(
                            <div
                                ref={notifPanelRef}
                                style={notifPanelStyle}
                                className="flex max-h-[min(480px,70vh)] flex-col overflow-hidden rounded-2xl border-2 border-sira-border bg-white text-popover-foreground shadow-2xl isolate"
                            >
                                <div className="flex items-center justify-between gap-3 border-b-2 border-sira-border bg-sira-bg-subtle/50 px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-[14px] font-bold tracking-tight text-sira-text-primary">{t('header.notifications')}</h3>
                                        {/* Sound toggle */}
                                        <button
                                            type="button"
                                            onClick={toggleSound}
                                            title={soundOn ? 'إيقاف صوت الإشعارات' : 'تشغيل صوت الإشعارات'}
                                            className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-lg border transition-colors',
                                                soundOn
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                                    : 'border-slate-200 bg-slate-100 text-slate-400 hover:bg-slate-200',
                                            )}
                                        >
                                            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                                        </button>
                                    </div>
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllRead}
                                            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-sira-brown hover:bg-sira-brown/5"
                                        >
                                            <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                                            <span className="whitespace-nowrap">{t('header.markAllRead')}</span>
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto bg-white">
                                    {notifications.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-12 text-sira-text-muted">
                                            <Bell className="mb-2 h-8 w-8 opacity-40" />
                                            <p className="text-[12px] font-bold text-sira-text-primary">{t('header.noNotifications')}</p>
                                        </div>
                                    ) : (
                                        notifications.map((n) => (
                                            <button
                                                key={n.id}
                                                type="button"
                                                onClick={() => handleNotificationClick(n)}
                                                className={`flex w-full items-start gap-3 border-b-2 border-sira-border px-4 py-3 text-start transition-colors last:border-b-0 ${!n.isRead
                                                        ? 'bg-sira-bg-subtle/30 hover:bg-sira-bg-subtle/50'
                                                        : 'hover:bg-sira-bg-hover'
                                                    }`}
                                            >
                                                <div className="mt-1.5 shrink-0">
                                                    {!n.isRead ? (
                                                        <div className="h-2 w-2 rounded-full bg-sira-gold shadow-sm" />
                                                    ) : (
                                                        <Check className="h-3 w-3 text-sira-text-muted" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1" dir="auto">
                                                    <p
                                                        className={`line-clamp-2 text-[12px] font-bold leading-snug break-words ${!n.isRead ? 'text-sira-text-primary' : 'text-sira-text-secondary'}`}
                                                    >
                                                        {n.title}
                                                    </p>
                                                    {n.message && (
                                                        <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed break-words text-sira-text-muted">
                                                            {n.message}
                                                        </p>
                                                    )}
                                                    <p className="mt-1.5 text-[10px] font-medium text-sira-text-muted" dir="ltr">
                                                        {formatNotifTime(n.createdAt)}
                                                    </p>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>,
                            document.body,
                        )}
                </div>
            </div>
            </div>{/* end desktop */}

            </div>
        </header>
    );
}

export default memo(HeaderComponent);

