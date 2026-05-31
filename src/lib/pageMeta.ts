import i18n from '../i18n';

/** Page titles for the top header (SIRA-style shell). */
export function getPageMeta(
    pathname: string,
    user: { firstName?: string; lastName?: string } | null | undefined,
): { title: string; subtitle: string } {
    const first = user?.firstName?.trim() || i18n.t('pageMeta.there');

    if (pathname.startsWith('/leads/') && pathname !== '/leads') {
        return { title: i18n.t('pageMeta.leadTitle'), subtitle: i18n.t('pageMeta.leadSubtitle') };
    }
    if (pathname.startsWith('/personnel/')) {
        return { title: i18n.t('pageMeta.profileTitle'), subtitle: i18n.t('pageMeta.profileSubtitle') };
    }
    if (pathname.startsWith('/teams/')) {
        return { title: i18n.t('pageMeta.teamTitle'), subtitle: i18n.t('pageMeta.teamSubtitle') };
    }
    if (pathname.startsWith('/units/previews/')) {
        return { title: i18n.t('pageMeta.unitPreviewTitle'), subtitle: i18n.t('pageMeta.unitPreviewSubtitle') };
    }
    if (/^\/units\/[^/]+$/.test(pathname)) {
        return { title: i18n.t('pageMeta.unitDetailsTitle'), subtitle: i18n.t('pageMeta.unitDetailsSubtitle') };
    }
    if (pathname.startsWith('/finance/') && pathname !== '/finance') {
        return { title: i18n.t('pageMeta.financeDetailsTitle'), subtitle: i18n.t('pageMeta.financeDetailsSubtitle') };
    }

    const table: Record<string, { title: string; subtitle: string }> = {
        '/dashboard': {
            title: i18n.t('pageMeta.dashboardTitle'),
            subtitle: i18n.t('pageMeta.dashboardSubtitle'),
        },
        '/leads': { title: i18n.t('pageMeta.leadsTitle'), subtitle: i18n.t('pageMeta.leadsSubtitle') },
        '/units': { title: i18n.t('pageMeta.unitsTitle'), subtitle: i18n.t('pageMeta.unitsSubtitle') },
        '/calculator': { title: i18n.t('pageMeta.calculatorTitle'), subtitle: i18n.t('pageMeta.calculatorSubtitle') },
        '/meetings': { title: i18n.t('pageMeta.meetingsTitle'), subtitle: i18n.t('pageMeta.meetingsSubtitle') },
        '/campaigns': { title: i18n.t('pageMeta.campaignsTitle'), subtitle: i18n.t('pageMeta.campaignsSubtitle') },
        '/brokerage/agents': { title: i18n.t('pageMeta.agentsTitle'), subtitle: i18n.t('pageMeta.agentsSubtitle') },
        '/brokerage/teams': { title: i18n.t('pageMeta.salesTeamsTitle'), subtitle: i18n.t('pageMeta.salesTeamsSubtitle') },
        '/hrs': { title: i18n.t('pageMeta.hrTitle'), subtitle: i18n.t('pageMeta.hrSubtitle') },
        '/finance': {
            title: i18n.t('pageMeta.financeTitle'),
            subtitle: i18n.t('pageMeta.financeSubtitle'),
        },
        '/profile': { title: i18n.t('pageMeta.profileTitle'), subtitle: i18n.t('pageMeta.profileSignedInAs', { first }) },
    };

    if (table[pathname]) return table[pathname];

    if (pathname.startsWith('/brokerage')) {
        return { title: i18n.t('pageMeta.brokerageTitle'), subtitle: i18n.t('pageMeta.brokerageSubtitle') };
    }

    return { title: 'SIRA', subtitle: i18n.t('pageMeta.welcomeSubtitle', { first }) };
}
