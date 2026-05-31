import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, UserCircle, X, MessageCircle } from 'lucide-react';
import { Fragment, useEffect, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { logout as logoutAction } from '../../redux/UserSlice';
import { Logout as logoutApi } from '../../services/api';
import { toast } from '../../lib/toast';
import LanguageToggle from './LanguageToggle';
import { getUserRoleName, getCanonicalRoleName } from '../../lib/userRole';
import { isAppRtl } from '../../lib/i18nDirection';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { getDashboardNavGroups } from './dashboardNav';

export type SiraDashboardShellProps = {
    children: ReactNode;
    mobileSidebarOpen: boolean;
    onCloseMobile: () => void;
};

export default function SiraDashboardShell({
    children,
    mobileSidebarOpen,
    onCloseMobile,
}: SiraDashboardShellProps) {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector((state: any) => state.user.user);
    const navGroups = getDashboardNavGroups(user);

    const handleLogout = async () => {
        try {
            await logoutApi();
        } finally {
            dispatch(logoutAction());
            navigate('/login');
            toast.success(t('sidebar.loggedOut'));
        }
    };

    const displayName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'SIRA' : 'Guest';
    const roleDisplay = user?.role?.displayName || user?.role?.name || 'Member';
    const roleKey = getUserRoleName(user);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && mobileSidebarOpen) {
                onCloseMobile();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [mobileSidebarOpen, onCloseMobile]);

    useEffect(() => {
        if (!mobileSidebarOpen) return;
        const prevBodyOverflow = document.body.style.overflow;
        const prevDocOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevDocOverflow;
        };
    }, [mobileSidebarOpen]);

    const linkClass = (navActive: boolean) =>
        cn(
            'flex items-center gap-4 rounded-2xl px-6 py-4 text-[14px] font-black leading-tight tracking-tight transition-all',
            navActive
                ? 'bg-[#0B1828] text-white shadow-lg shadow-[#0B1828]/15'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#0B1828]',
        );

    const iconWrapClass = (navActive: boolean) => (navActive ? 'text-[#BF9B30]' : 'text-slate-400');

    const sidebarInner = (
        <>
            <div className="flex shrink-0 items-center justify-between px-8 pb-4 pt-16 md:pt-8">
                <h1 className="text-2xl font-black leading-none tracking-widest text-[#0B1828]">
                    SIRA <span className="text-[#BF9B30]">CRM</span>
                </h1>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0B1828] text-xl font-black text-white shadow-lg shadow-[#0B1828]/20">
                    S
                </div>
            </div>

            <nav className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pt-2">
                {navGroups.map((group) => (
                    <Fragment key={group.heading}>
                        <p className="px-1 pb-1.5 pt-4 text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 first:pt-0">
                            {t(group.heading)}
                        </p>
                        <div className="flex flex-col gap-1.5 pb-3">
                            {group.items.map((item) => {
                                const activeByPrefix = item.matchPrefix
                                    ? location.pathname.startsWith(item.matchPrefix)
                                    : false;
                                return (
                                    <NavLink
                                        key={item.path + item.label}
                                        to={item.path}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) =>
                                            linkClass(activeByPrefix || (!item.matchPrefix && isActive))
                                        }
                                    >
                                        {({ isActive }) => {
                                            const navActive = activeByPrefix || (!item.matchPrefix && isActive);
                                            return (
                                                <>
                                                    <span className={iconWrapClass(navActive)}>
                                                        <item.icon className="h-5 w-5" strokeWidth={navActive ? 2.5 : 2} />
                                                    </span>
                                                    <span className="truncate">{t(item.label)}</span>
                                                </>
                                            );
                                        }}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </Fragment>
                ))}
            </nav>

            <div className="space-y-3 px-6 pb-6 pt-3">
                <div className="flex items-center gap-4 rounded-[2rem] border border-slate-100 bg-slate-50 p-5 transition-all hover:bg-slate-100">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-[#0B1828] shadow-sm">
                        {user
                            ? `${(user.firstName?.[0] || '').toUpperCase()}${(user.lastName?.[0] || '').toUpperCase()}`.slice(
                                  0,
                                  2,
                              ) || 'SI'
                            : '??'}
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="truncate text-sm font-black text-[#0B1828]">{displayName}</p>
                        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-500">
                            {roleDisplay}
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-2">
                    <LanguageToggle className="!h-10 !bg-white" />
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/profile');
                            onCloseMobile();
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500 transition-all hover:bg-slate-100 hover:text-[#0B1828]"
                        title={t('sidebar.profile')}
                    >
                        <UserCircle className="h-4 w-4" />
                    </button>
                    {getCanonicalRoleName(user) === 'super_admin' && (
                        <button
                            type="button"
                            onClick={() => { navigate('/settings/whatsapp-connect'); onCloseMobile(); }}
                            className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                                location.pathname === '/settings/whatsapp-connect'
                                    ? 'bg-[#16a34a] text-white'
                                    : 'bg-slate-50 text-slate-500 hover:bg-[#16a34a]/10 hover:text-[#16a34a]',
                            )}
                            title={t('sidebar.whatsappGateway')}
                        >
                            <MessageCircle className="h-4 w-4" />
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-2 rounded-[1.5rem] border border-rose-100 bg-rose-50 px-4 py-3 text-xs font-black text-rose-600 transition-all hover:bg-rose-100 active:scale-95"
                >
                    <LogOut className="h-4 w-4" />
                    {t('sidebar.logout')}
                </button>
            </div>
        </>
    );

    /**
     * Sidebar position vs language:
     * - `html[dir=rtl]` (Arabic) would invert flex layout if we used only `flex-row-reverse`.
     * - We force `dir="ltr"` on the desktop row so physical left/right are stable, then use
     *   `order` so LTR = sidebar left / main right, RTL = main left / sidebar right.
     */
    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
                className={cn(
                    'fixed inset-0 z-[90] bg-black/45 transition-opacity md:hidden',
                    mobileSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
                )}
                onClick={onCloseMobile}
                aria-hidden={!mobileSidebarOpen}
            />

            <div
                    className={cn(
                        'fixed inset-y-0 z-[100] flex h-dvh max-w-full p-4 transition-transform duration-300 md:hidden',
                    isRtl ? 'right-0' : 'left-0',
                    mobileSidebarOpen ? 'translate-x-0' : isRtl ? 'translate-x-full' : '-translate-x-full',
                )}
            >
                <aside
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className="relative flex h-full w-[min(18rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl shadow-slate-200/50 sm:w-[min(20rem,calc(100vw-2rem))]"
                >
                    <button
                        type="button"
                        onClick={onCloseMobile}
                        className={cn(
                            'absolute top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 md:hidden',
                            isRtl ? 'left-4' : 'right-4',
                        )}
                        aria-label={t('common.close')}
                    >
                        <X className="h-4 w-4" />
                    </button>
                    {sidebarInner}
                </aside>
            </div>

            <div
                key={`${roleKey}-${i18n.language}-${isRtl ? 'rtl' : 'ltr'}`}
                className="flex min-h-0 min-w-0 flex-1 flex-row"
                dir="ltr"
            >
                <div
                        className={cn(
                        'sticky top-0 z-20 hidden h-dvh shrink-0 self-stretch p-4 lg:p-6 md:flex',
                        isRtl ? 'order-2' : 'order-1',
                    )}
                >
                    <aside
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className="flex h-full w-72 flex-col overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl shadow-slate-200/50 xl:w-80"
                    >
                        {sidebarInner}
                    </aside>
                </div>

                <div
                    className={cn(
                        'flex min-h-0 min-w-0 flex-1 flex-col',
                        isRtl ? 'order-1' : 'order-2',
                    )}
                    dir={isRtl ? 'rtl' : 'ltr'}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
