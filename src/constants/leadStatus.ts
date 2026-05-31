/**
 * Lead pipeline statuses — keep in sync with `enum LeadStatus` in `backend/prisma/schema.prisma`.
 * The API persists these strings on `Lead.status` and `LeadFeedback.feedbackType`.
 * UI labels: `leadDetail.statusValues.*` in i18n (list, detail, feedback grid, dropdowns).
 */





export const LEAD_STATUS_ENUM_VALUES = [
    'new_lead',
    'cold_call',
    'follow_up',
    'qualified',
    'no_answer',
    'wrong_number',
    'not_interested',
    'switched_off',
    'meeting_cancelled',
    'purchased',
    'assigned',
    'rotation',
    'interested',
    'contacted',
    'converted',
    'closed',
    'lost',
] as const;

export type LeadStatusEnum = (typeof LEAD_STATUS_ENUM_VALUES)[number];

/**
 * Status filter chips on the Leads list (`GET /leads?status=`).
 * Same outcomes + order as the lead-detail feedback grid, then `assigned`.
 * Omits `rotation` (rotation pool view). Labels: `leadDetail.statusValues.*`.
 */
export const LEADS_PAGE_STATUS_FILTERS: readonly LeadStatusEnum[] = [
    'no_answer',
    'switched_off',
    'follow_up',
    'cold_call',
    'wrong_number',
    'not_interested',
    'new_lead',
    'qualified',
    'meeting_cancelled',
    'purchased',
    'closed',
    'lost',
    'assigned',
];

/**
 * Feedback grid on lead detail & related modals — user-selectable outcomes only.
 * Exactly 10 tiles (two rows of five). Excludes `rotation`, `assigned`, `closed`, `lost`.
 */
export const FEEDBACK_GRID_ORDER: readonly LeadStatusEnum[] = [
    'no_answer',
    'switched_off',
    'follow_up',
    'cold_call',
    'wrong_number',
    'not_interested',
    'new_lead',
    'qualified',
    'meeting_cancelled',
    'purchased',
];
