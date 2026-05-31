import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Home, UsersRound, Calendar, LogOut, TrendingUp, ClipboardCheck, UserCircle, Calculator, HandCoins, Bookmark, MessageCircle } from 'lucide-react';
import React, { Fragment } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { logout as logoutAction } from '../../redux/UserSlice';
import { Logout as logoutApi } from '../../services/api';
import { toast } from '../../lib/toast';
import ThemeToggle from './ThemeToggle';
import { getUserRoleName, getCanonicalRoleName, isSalesUser, canAccessCampaignsPage } from '../../lib/userRole';
import { isAppRtl } from '../../lib/i18nDirection';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

type MenuItem = {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    label: string;
    path: string;
    matchPrefix?: string;
};
type NavGroup = { heading: string; items: MenuItem[] };
type SidebarProps = { mobileOpen?: boolean; onCloseMobile?: () => void };

const mainItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'sidebar.dashboard', path: '/dashboard' },
    { icon: Users, label: 'sidebar.leads', path: '/leads' },
    { icon: Home, label: 'sidebar.units', path: '/units' },
    { icon: Bookmark, label: 'sidebar.saved', path: '/saved' },
    { icon: Calculator, label: 'sidebar.calculator', path: '/calculator' },
    { icon: Calendar, label: 'sidebar.meetings', path: '/meetings' },
    { icon: TrendingUp, label: 'sidebar.campaigns', path: '/campaigns' },
];
const unitsOnlyMain: MenuItem[] = [{ icon: Home, label: 'sidebar.units', path: '/units' }];
const orgItems: MenuItem[] = [{ icon: UsersRound, label: 'sidebar.agentsTeams', path: '/brokerage/teams', matchPrefix: '/brokerage' }];
const hrItem: MenuItem = { icon: ClipboardCheck, label: 'sidebar.hrModule', path: '/hrs' };
const financeItem: MenuItem = { icon: HandCoins, label: 'sidebar.finance', path: '/finance' };

function buildNavGroups(isSuperAdmin: boolean, isSales: boolean, isMarketing: boolean, isHr: boolean, showCampaignsNav: boolean): NavGroup[] {
    if (isMarketing) return [{ heading: 'sidebar.main', items: unitsOnlyMain }];
    if (isHr) return [{ heading: 'sidebar.main', items: [{ icon: LayoutDashboard, label: 'sidebar.dashboard', path: '/dashboard' }] }, { heading: 'sidebar.organization', items: [financeItem, hrItem] }];
    const main = mainItems.filter((item) => {
        if (item.path === '/campaigns' && !showCampaignsNav) return false;
        if (item.path === '/saved' && !isSales) return false;
        return true;
    });
    const org = isSales ? [] : [...orgItems];
    if (isSales) org.push(
        { icon: MessageCircle, label: 'sidebar.whatsappBroadcast', path: '/whatsapp-broadcast' },
        { icon: MessageCircle, label: 'sidebar.whatsappConnect', path: '/settings/whatsapp-connect' },
    );
    if (isSuperAdmin) org.push(
        financeItem,
        hrItem,
        { icon: MessageCircle, label: 'sidebar.whatsappGateway', path: '/settings/whatsapp' },
    );
    const groups: NavGroup[] = [{ heading: 'sidebar.main', items: main }];
    if (org.length > 0) groups.push({ heading: 'sidebar.organization', items: org });
    return groups;
}

export default function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const navGroups = buildNavGroups(roleName === 'super_admin', isSalesUser(user), roleName === 'marketing', roleName === 'hr', canAccessCampaignsPage(user));

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

    const linkClass = (navActive: boolean) => cn(
        'mx-4 flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300',
        navActive
            ? 'bg-[#0B1828] text-white shadow-xl shadow-slate-900/10'
            : 'text-slate-500 hover:bg-slate-50 hover:text-[#0B1828]',
    );
    const iconClass = (navActive: boolean) => cn(
        'h-4 w-4 shrink-0',
        navActive ? 'text-white' : 'text-slate-400 group-hover:text-[#0B1828]',
    );

    const content = (
        <div className="flex flex-col h-full bg-white dark:bg-sira-bg-card">
            <div className="shrink-0 px-8 pb-4 pt-10">
                <div className="flex flex-row items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1828] text-xl font-black text-white shadow-lg shrink-0">S</div>
                    <div className="flex flex-row items-baseline gap-1">
                        <span className="text-3xl font-black tracking-tight text-[#0B1828] dark:text-white">SIRA</span>
                        <span className="text-3xl font-black tracking-tight text-[#BF9B30]">CRM</span>
                    </div>
                </div>
            </div>

            <nav className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-2 pt-6">
                {navGroups.map((group) => (
                    <Fragment key={group.heading}>
                        <p className="px-8 pb-2 pt-6 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 opacity-80 first:pt-0">
                            {t(group.heading)}
                        </p>
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const activeByPrefix = item.matchPrefix ? location.pathname.startsWith(item.matchPrefix) : false;
                                return (
                                    <NavLink
                                        key={item.path + item.label}
                                        to={item.path}
                                        onClick={onCloseMobile}
                                        className={({ isActive }) => linkClass(activeByPrefix || (!item.matchPrefix && isActive))}
                                    >
                                        {({ isActive }) => {
                                            const navActive = activeByPrefix || (!item.matchPrefix && isActive);
                                            return (
                                                <div className="flex flex-row w-full items-center gap-4">
                                                    <item.icon className={iconClass(navActive)} strokeWidth={2.5} />
                                                    <span className="flex-1 text-[14px] font-black uppercase tracking-widest">{t(item.label)}</span>
                                                </div>
                                            );
                                        }}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </Fragment>
                ))}
            </nav>

            <div className="mt-auto p-4 space-y-4">
                <div className="rounded-[2.5rem] bg-slate-50/80 dark:bg-foreground/5 p-6 border border-slate-100 dark:border-sira-border/50">
                    <div className="flex flex-row items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-100 text-sm font-black text-[#0B1828] shadow-sm">
                            {user ? `${(user.firstName?.[0] || '').toUpperCase()}${(user.lastName?.[0] || '').toUpperCase()}`.slice(0, 2) || 'SI' : '??'}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-black text-[#0B1828] dark:text-white">{displayName}</p>
                            <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">{roleDisplay}</p>
                        </div>
                    </div>
                    
                    <div className="mt-6 flex items-center justify-center gap-4 pt-4 border-t border-slate-200/50">
                        <ThemeToggle className="!h-10 !w-10 !rounded-2xl !border-slate-100 !bg-white hover:!bg-slate-50 shadow-sm" />
                        <button type="button" onClick={() => navigate('/profile')} className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-[#0B1828] shadow-sm" title={t('sidebar.profile')}><UserCircle className="w-5 h-5" /></button>
                        {getCanonicalRoleName(user) === 'super_admin' && (
                            <button
                                type="button"
                                onClick={() => { navigate('/settings/whatsapp'); onCloseMobile?.(); }}
                                className={cn(
                                    'h-10 w-10 flex items-center justify-center rounded-2xl border shadow-sm transition-colors',
                                    location.pathname === '/settings/whatsapp'
                                        ? 'bg-[#16a34a] border-[#16a34a] text-white'
                                        : 'bg-white border-slate-100 text-slate-400 hover:text-[#16a34a] hover:border-[#16a34a]/30',
                                )}
                                title={t('sidebar.whatsappGateway')}
                            >
                                <MessageCircle className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* WhatsApp Gateway shortcut — always rendered for super_admin */}
                <NavLink
                    to="/settings/whatsapp"
                    onClick={onCloseMobile}
                    className={({ isActive }) => cn(
                        'flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-200',
                        isActive
                            ? 'bg-[#16a34a] text-white shadow-md'
                            : 'bg-emerald-50 text-[#16a34a] hover:bg-emerald-100 border border-emerald-200',
                    )}
                >
                    {({ isActive }) => (
                        <>
                            <MessageCircle className={cn('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-[#16a34a]')} strokeWidth={2.5} />
                            <span className="flex-1 text-[13px] font-black uppercase tracking-widest">
                                {t('sidebar.whatsappGateway')}
                            </span>
                        </>
                    )}
                </NavLink>

                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center justify-center gap-3 rounded-[2rem] bg-rose-50 px-4 py-4 text-[12px] font-black uppercase tracking-[0.2em] text-rose-600 transition-all hover:bg-rose-100 active:scale-95"
                >
                    <LogOut className="h-4 w-4" />
                    {t('sidebar.logout')}
                </button>
            </div>
        </div>
    );

    return (
        <>
            <motion.aside
                key={`sidebar-desktop-${i18n.language}`}
                dir={isRtl ? 'rtl' : 'ltr'}
                initial={{ x: isRtl ? 280 : -280 }}
                animate={{ x: 0 }}
                className={`relative z-20 hidden h-dvh min-h-0 w-[280px] shrink-0 flex-col bg-white shadow-xl md:flex ${isRtl ? 'border-l' : 'border-r'} border-slate-100 dark:border-sira-border`}
            >
                {content}
            </motion.aside>
            <div
                className={`fixed inset-0 z-[90] bg-black/45 transition-opacity md:hidden ${mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
                onClick={onCloseMobile}
            />
            <aside
                key={`sidebar-mobile-${i18n.language}`}
                dir={isRtl ? 'rtl' : 'ltr'}
                className={cn(
                    'fixed inset-y-0 z-[100] flex h-dvh min-h-0 w-[280px] flex-col bg-white shadow-2xl transition-transform duration-300 md:hidden',
                    isRtl ? "right-0 border-l" : "left-0 border-r",
                    mobileOpen ? "translate-x-0" : isRtl ? "translate-x-full" : "-translate-x-full"
                )}
            >
                {content}
            </aside>
        </>
    );
}
