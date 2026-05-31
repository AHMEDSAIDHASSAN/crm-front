/** Raw label / slug from API / Redux (`name`, or `displayName` when `name` is missing). */
export function getUserRoleName(
    user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined,
): string {
    if (!user?.role) return '';
    if (typeof user.role === 'string') return String(user.role).trim().toLowerCase();
    const raw = user.role.name ?? user.role.displayName ?? '';
    return String(raw).trim().toLowerCase();
}

/** Collapse separators and known aliases → Prisma slug (e.g. `operation_manager`). */
function normalizeRoleSlugFragments(raw: string): string {
    let n = raw
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
    if (
        n === 'operation' ||
        n === 'operations' ||
        n === 'operations_manager' ||
        n === 'ops_manager' ||
        n === 'operational_manager'
    ) {
        n = 'operation_manager';
    }
    return n;
}

/**
 * Role slug for permission checks (matches backend `normalizeRoleSlug` intent).
 * Handles display names, hyphens, missing `role.name`, and short aliases.
 */
export function getCanonicalRoleName(
    user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined,
): string {
    let n = normalizeRoleSlugFragments(getUserRoleName(user));
    /** Match backend `role-slug.util`: team leader row / UI label → `tech_lead`. */
    if (n === 'team_leader' || n === 'teamlead' || n === 'team_lead') n = 'tech_lead';
    return n;
}

/**
 * UI-safe role label.
 * Always shows `tech_lead` as "Team Leader" (localized when translator provided).
 */
export function getRoleDisplayName(
    role: string | { name?: string; displayName?: string | null } | null | undefined,
    t?: (key: string, options?: Record<string, unknown>) => string,
): string {
    if (!role) return '';
    const raw =
        typeof role === 'string'
            ? role
            : String(role.displayName || role.name || '').trim();
    const canonical = normalizeRoleSlugFragments(String(raw || '').toLowerCase());
    if (canonical === 'tech_lead') {
        return t ? t('teamsPage.teamLeaderRole', { defaultValue: 'Team Leader' }) : 'Team Leader';
    }
    return raw || '';
}

export function isSalesUser(user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined): boolean {
    return getCanonicalRoleName(user) === 'sales';
}

/** Campaigns page + nav: super admin and operations only (API may still expose list for leads filters). */
export function canAccessCampaignsPage(
    user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined,
): boolean {
    const n = getCanonicalRoleName(user);
    return n === 'super_admin' || n === 'operation_manager';
}

type RoleBag = {
    name?: string;
    displayName?: string | null;
    hierarchyLevel?: number;
};

/**
 * Excel / bulk export on Leads: super_admin and operation_manager.
 * Fallback: persisted user sometimes lacks `role.name` but keeps `displayName` or `hierarchyLevel` from Prisma (`1` = operation manager per seed).
 */
/** Delete marketing `Campaign` row (detach leads with null `campaignId` on backend). UI: super_admin only. */
export function canDeleteMarketingCampaign(
    user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined,
): boolean {
    return getCanonicalRoleName(user) === 'super_admin';
}

/** Delete data import batch (+ linked leads via API). Backend: DELETE /data-batches/:id — super_admin only. */
export function canDeleteDataBatch(
    user: { role?: string | { name?: string; displayName?: string | null } } | null | undefined,
): boolean {
    return getCanonicalRoleName(user) === 'super_admin';
}

export function canExportLeadsDashboard(
    user: { role?: string | RoleBag } | null | undefined,
): boolean {
    const slug = getCanonicalRoleName(user);
    if (slug === 'super_admin' || slug === 'operation_manager') return true;
    if (slug) return false;
    const rl = typeof user?.role === 'object' && user.role ? (user.role as RoleBag) : null;
    const h = rl?.hierarchyLevel;
    return typeof h === 'number' && h === 1;
}
