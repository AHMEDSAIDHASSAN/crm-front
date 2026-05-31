import {
    LayoutDashboard,
    Users,
    Home,
    UsersRound,
    Calendar,
    TrendingUp,
    ClipboardCheck,
    Calculator,
    HandCoins,
    Bookmark,
    BarChart3,
    MessageCircle,
    Sparkles,
    UserCheck,
    type LucideIcon,
} from 'lucide-react';
import { canAccessCampaignsPage, getCanonicalRoleName } from '../../lib/userRole';

export type MenuItem = {
    icon: LucideIcon;
    label: string;
    path: string;
    matchPrefix?: string;
};

export type NavGroup = { heading: string; items: MenuItem[] };

const mainItems: MenuItem[] = [
    { icon: LayoutDashboard, label: 'sidebar.dashboard', path: '/dashboard' },
    { icon: Users, label: 'sidebar.leads', path: '/leads' },
    { icon: Home, label: 'sidebar.units', path: '/units' },
    { icon: Bookmark, label: 'sidebar.saved', path: '/saved' },
    { icon: Sparkles, label: 'sidebar.salesAssistant', path: '/sales-assistant' },
    { icon: Calculator, label: 'sidebar.calculator', path: '/calculator' },
    { icon: Calendar, label: 'sidebar.meetings', path: '/meetings' },
    { icon: UserCheck, label: 'sidebar.attendance', path: '/attendance' },
    { icon: BarChart3, label: 'sidebar.performance', path: '/performance' },
    { icon: TrendingUp, label: 'sidebar.campaigns', path: '/campaigns' },
];

const unitsOnlyMain: MenuItem[] = [{ icon: Home, label: 'sidebar.units', path: '/units' }];

const orgItems: MenuItem[] = [
    { icon: UsersRound, label: 'sidebar.agentsTeams', path: '/brokerage/teams', matchPrefix: '/brokerage' },
];

const hrItem: MenuItem = { icon: ClipboardCheck, label: 'sidebar.hrModule', path: '/hrs' };
const financeItem: MenuItem = { icon: HandCoins, label: 'sidebar.finance', path: '/finance' };

export function buildDashboardNavGroups(
    isSuperAdmin: boolean,
    isSales: boolean,
    isMarketing: boolean,
    isHr: boolean,
    showCampaignsNav: boolean,
): NavGroup[] {
    if (isMarketing) return [{ heading: 'sidebar.main', items: unitsOnlyMain }];
    if (isHr)
        return [
            { heading: 'sidebar.main', items: [{ icon: LayoutDashboard, label: 'sidebar.dashboard', path: '/dashboard' }] },
            { heading: 'sidebar.organization', items: [financeItem, hrItem] },
        ];
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
    if (isSuperAdmin) org.push(financeItem, hrItem, { icon: MessageCircle, label: 'sidebar.whatsappGateway', path: '/settings/whatsapp-connect' });
    const groups: NavGroup[] = [{ heading: 'sidebar.main', items: main }];
    if (org.length > 0) groups.push({ heading: 'sidebar.organization', items: org });
    return groups;
}

export function getDashboardNavGroups(user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined): NavGroup[] {
    const n = getCanonicalRoleName(user);
    return buildDashboardNavGroups(
        n === 'super_admin',
        n === 'sales',
        n === 'marketing',
        n === 'hr',
        canAccessCampaignsPage(user),
    );
}
