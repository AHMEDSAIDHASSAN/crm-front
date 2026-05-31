import type { LucideIcon } from 'lucide-react';
import {
    LayoutDashboard,
    Users,
    Home,
    Calculator,
    Calendar,
    BarChart3,
    TrendingUp,
    UsersRound,
    HandCoins,
    ClipboardCheck,
} from 'lucide-react';
import { getUserRoleName } from './userRole';

export const SIRA_ONBOARDING_STORAGE_KEY = 'sira_app_onboarding_v1_done';

export type OnboardingStep = {
    id: string;
    title: string;
    description: string;
    Icon: LucideIcon;
};

/**
 * Mirrors sidebar visibility so first-time users only see steps for routes they can access.
 */
export function getOnboardingStepsForUser(user: { role?: string | { name?: string } } | null): OnboardingStep[] {
    const role = getUserRoleName(user);
    const isMarketing = role === 'marketing';
    const isHr = role === 'hr';
    const isSales = role === 'sales';
    const isSuperAdmin = role === 'super_admin';

    if (isMarketing) {
        return [
            {
                id: 'units',
                title: 'Units',
                description:
                    'Review publish requests, set listing links, and manage the live catalog. This is your main workspace in SIRA.',
                Icon: Home,
            },
        ];
    }

    if (isHr) {
        return [
            {
                id: 'dashboard',
                title: 'Dashboard',
                description: 'A quick snapshot of activity. Open other sections from the sidebar when you need them.',
                Icon: LayoutDashboard,
            },
            {
                id: 'finance',
                title: 'Finance',
                description: 'Salaries, deductions, and commissions — manage payouts and financial records for the team.',
                Icon: HandCoins,
            },
            {
                id: 'hrs',
                title: 'HR module',
                description: 'People operations: attendance, records, and HR workflows your role can access.',
                Icon: ClipboardCheck,
            },
        ];
    }

    const steps: OnboardingStep[] = [
        {
            id: 'dashboard',
            title: 'Dashboard',
            description:
                'Your home base: key numbers, recent lead activity, and shortcuts. Come back here for a quick health check on the business.',
            Icon: LayoutDashboard,
        },
        {
            id: 'leads',
            title: 'Leads',
            description:
                'The CRM pipeline — search, filter by source and owner, work the rotation pool, and open any lead for full history.',
            Icon: Users,
        },
        {
            id: 'units',
            title: 'Units',
            description:
                'Listings and inventory: drafts, published stock, preview requests for showings, and (for marketing) publishing.',
            Icon: Home,
        },
        {
            id: 'calculator',
            title: 'Calculator',
            description: 'Run installment and financing scenarios to quote buyers with consistent numbers.',
            Icon: Calculator,
        },
        {
            id: 'meetings',
            title: 'Meetings',
            description: 'Scheduled visits and follow-ups. Tie meetings to leads, use check-in/check-out when your process requires it.',
            Icon: Calendar,
        },
        {
            id: 'performance',
            title: 'Performance',
            description:
                'Per-person metrics (leads, conversions, meetings) for people in your scope — so managers and leads can see how the floor is doing.',
            Icon: BarChart3,
        },
    ];

    if (!isSales) {
        steps.push({
            id: 'campaigns',
            title: 'Campaigns',
            description: 'Marketing campaigns and cold-data imports — track spend and where leads enter the CRM.',
            Icon: TrendingUp,
        });
    }

    if (!isSales) {
        steps.push({
            id: 'brokerage',
            title: 'Agents & teams',
            description:
                'The brokerage hub: agent roster and sales teams (pods). Switch between Agents and Sales teams at the top of that section.',
            Icon: UsersRound,
        });
    }

    if (isSuperAdmin) {
        steps.push(
            {
                id: 'finance',
                title: 'Finance',
                description: 'Company-wide salaries, deductions, and commissions — restricted to Super Admin (and HR where enabled).',
                Icon: HandCoins,
            },
            {
                id: 'hrs',
                title: 'HR module',
                description: 'HR tools and records for administrators.',
                Icon: ClipboardCheck,
            },
        );
    }

    return steps;
}
