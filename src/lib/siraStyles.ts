import {
    PhoneOff,
    PhoneMissed,
    CalendarClock,
    ZapOff,
    BadgeCheck,
    CalendarX,
    Star,
    UserPlus,
    ThumbsDown,
    XCircle,
    Handshake,
    Phone,
} from 'lucide-react';
import { createElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Unit status badge styles (maps backend UnitStatus enum values)
// ---------------------------------------------------------------------------

export const UNIT_STATUS_BADGE: Record<string, { label: string; bg: string; text: string; border: string; solid: string }> = {
    available:   { label: 'AVAILABLE',   bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', solid: 'bg-emerald-500' },
    reserved:    { label: 'RESERVED',    bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   solid: 'bg-amber-500' },
    sold:        { label: 'SOLD',        bg: 'bg-rose-50',    text: 'text-rose-500',     border: 'border-rose-100',    solid: 'bg-rose-500' },
    unavailable: { label: 'UNAVAILABLE', bg: 'bg-slate-50',   text: 'text-slate-500',    border: 'border-slate-100',   solid: 'bg-slate-400' },
};

export function unitStatusBadgeClass(status: string | undefined, variant: 'pill' | 'solid' = 'pill') {
    const s = UNIT_STATUS_BADGE[(status ?? '').toLowerCase()] ?? UNIT_STATUS_BADGE.available;
    if (variant === 'solid') return `${s.solid} text-white`;
    return `${s.bg} ${s.text} ${s.border}`;
}

// ---------------------------------------------------------------------------
// Lead status badge styles (maps backend LeadStatus enum values)
// ---------------------------------------------------------------------------

export const LEAD_STATUS_BADGE: Record<string, { bg: string; text: string }> = {
    new_lead:       { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    cold_call:      { bg: 'bg-cyan-50',    text: 'text-cyan-600' },
    follow_up:      { bg: 'bg-amber-50',   text: 'text-amber-600' },
    qualified:      { bg: 'bg-blue-50',    text: 'text-blue-600' },
    no_answer:      { bg: 'bg-rose-50',    text: 'text-rose-500' },
    wrong_number:   { bg: 'bg-red-50',     text: 'text-red-500' },
    not_interested: { bg: 'bg-red-50',     text: 'text-red-600' },
    switched_off:   { bg: 'bg-slate-100',  text: 'text-slate-600' },
    meeting_cancelled: { bg: 'bg-slate-100', text: 'text-slate-600' },
    purchased:      { bg: 'bg-green-50',   text: 'text-green-600' },
    assigned:       { bg: 'bg-slate-100',  text: 'text-slate-600' },
    rotation:       { bg: 'bg-violet-50',  text: 'text-violet-600' },
    contacted:      { bg: 'bg-sky-50',     text: 'text-sky-600' },
    interested:     { bg: 'bg-blue-50',    text: 'text-blue-600' },
    closed:         { bg: 'bg-slate-100',  text: 'text-slate-500' },
    lost:           { bg: 'bg-red-100',    text: 'text-red-700' },
    converted:      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};

export function leadStatusBadgeClass(status: string | undefined) {
    const s = LEAD_STATUS_BADGE[(status ?? '').toLowerCase()] ?? { bg: 'bg-slate-50', text: 'text-slate-500' };
    return `${s.bg} ${s.text}`;
}

// ---------------------------------------------------------------------------
// Lead stage options (for the visual stage grid in lead detail)
// ---------------------------------------------------------------------------

export interface StageOption {
    label: string;
    value: string;
    colorClass: string;
    icon: ReactNode;
}

/** Icon/color presets per Prisma `LeadStatus` — keys must match DB enum (see `constants/leadStatus.ts`). */
/** Labels are display-neutral — UI uses `translateLeadStatus` + `leadDetail.statusValues.*` (i18n). */
export const LEAD_STAGE_OPTIONS: StageOption[] = [
    { label: 'Wrong number',      value: 'wrong_number',      colorClass: 'bg-red-50 text-red-600 border-red-100',       icon: createElement(PhoneOff,     { size: 22, strokeWidth: 2.5 }) },
    { label: 'Cold call',         value: 'cold_call',         colorClass: 'bg-cyan-50 text-cyan-600 border-cyan-100',     icon: createElement(Phone,        { size: 22, strokeWidth: 2.5 }) },
    { label: 'Follow up',         value: 'follow_up',         colorClass: 'bg-amber-50 text-amber-600 border-amber-100',  icon: createElement(CalendarClock, { size: 22, strokeWidth: 2.5 }) },
    { label: 'Switched off',      value: 'switched_off',      colorClass: 'bg-slate-100 text-slate-500 border-slate-200', icon: createElement(ZapOff,       { size: 22, strokeWidth: 2.5 }) },
    { label: 'No answer',         value: 'no_answer',         colorClass: 'bg-slate-50 text-slate-500 border-slate-200',  icon: createElement(PhoneMissed,  { size: 22, strokeWidth: 2.5 }) },
    { label: 'Purchased',         value: 'purchased',         colorClass: 'bg-green-50 text-green-600 border-green-100',  icon: createElement(BadgeCheck,   { size: 22, strokeWidth: 2.5 }) },
    { label: 'Meeting cancelled', value: 'meeting_cancelled', colorClass: 'bg-slate-100 text-slate-500 border-slate-200', icon: createElement(CalendarX,    { size: 22, strokeWidth: 2.5 }) },
    { label: 'Qualified',         value: 'qualified',         colorClass: 'bg-blue-50 text-blue-600 border-blue-100',     icon: createElement(Star,         { size: 22, strokeWidth: 2.5 }) },
    { label: 'New lead',          value: 'new_lead',          colorClass: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: createElement(UserPlus, { size: 22, strokeWidth: 2.5 }) },
    { label: 'Not interested',    value: 'not_interested',    colorClass: 'bg-rose-50 text-rose-600 border-rose-100',     icon: createElement(ThumbsDown,   { size: 22, strokeWidth: 2.5 }) },
    { label: 'Closed',            value: 'closed',            colorClass: 'bg-slate-100 text-slate-500 border-slate-200', icon: createElement(XCircle,      { size: 22, strokeWidth: 2.5 }) },
    { label: 'Lost',              value: 'lost',              colorClass: 'bg-red-50 text-red-500 border-red-100',        icon: createElement(Handshake,    { size: 22, strokeWidth: 2.5 }) },
];

// ---------------------------------------------------------------------------
// Unit type presets for the add-unit wizard
// ---------------------------------------------------------------------------

/** Display prefixes — match backend `getCodePrefixFromUnitType` (A/V/P/S/T/C). */
export const UNIT_TYPE_WIZARD = [
    { label: 'شقة',     prefix: 'A', emoji: '🏢', value: 'd' },
    { label: 'فيلا',    prefix: 'V', emoji: '🏰', value: 'v' },
    { label: 'بنتهاوس', prefix: 'P', emoji: '🏙️', value: 'ph' },
    { label: 'شاليه',   prefix: 'S', emoji: '🏖️', value: 's' },
    { label: 'استوديو', prefix: 'T', emoji: '🏠', value: 'st' },
    { label: 'تجاري',   prefix: 'C', emoji: '🏬', value: 'c' },
] as const;

// ---------------------------------------------------------------------------
// Amenity presets (Arabic labels for the sira-style UI)
// ---------------------------------------------------------------------------

export const AMENITY_PRESETS_AR = [
    'أمن 24 ساعة', 'حديقة', 'جراج', 'أسانسير',
    'تكييف مركزي', 'مسبح', 'صالة ألعاب رياضة', 'نظام حريق',
];
