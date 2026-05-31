/** Canonical role slug for permission checks (JWT/API may send spaces or display variants). */
export function normalizeRoleSlug(raw?: string | null): string {
    let r = String(raw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    if (r === 'operation') r = 'operation_manager';
    /** Legacy / UI alias: team leader on a sales team uses `tech_lead` in DB and APIs. */
    if (r === 'team_leader' || r === 'team-leader' || r === 'teamlead') r = 'tech_lead';
    return r;
}
