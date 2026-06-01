import type { ReactNode } from 'react';
import {
    Ban,
    MessageSquare,
    Power,
    RefreshCw,
    Sparkles,
    UserCheck,
} from 'lucide-react';
import { LEAD_STAGE_OPTIONS, type StageOption } from './siraStyles';
import { FEEDBACK_GRID_ORDER } from '../constants/leadStatus';

/** Re-export — canonical order lives in `constants/leadStatus.ts` (aligned with Prisma `LeadStatus`). */
export { FEEDBACK_GRID_ORDER };

const FEEDBACK_GRID_FALLBACK: Record<string, { colorClass: string; icon: ReactNode }> = {
    new_lead: {
        colorClass:
            'bg-emerald-50 text-emerald-700 border-emerald-100/90 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/50',
        icon: <Sparkles className="h-5 w-5 opacity-90" />,
    },
    assigned: {
        colorClass:
            'bg-sky-50 text-sky-700 border-sky-100/90 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800/50',
        icon: <UserCheck className="h-5 w-5 opacity-90" />,
    },
    rotation: {
        colorClass:
            'bg-violet-50 text-violet-700 border-violet-100/90 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800/50',
        icon: <RefreshCw className="h-5 w-5 opacity-90" />,
    },
    switched_off: {
        colorClass:
            'bg-rose-50 text-rose-700 border-rose-100/90 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800/50',
        icon: <Power className="h-5 w-5 opacity-90" />,
    },
    meeting_cancelled: {
        colorClass:
            'bg-slate-100 text-slate-700 border-slate-200/90 dark:bg-slate-900/50 dark:text-slate-200 dark:border-slate-700/70',
        icon: <Ban className="h-5 w-5 opacity-90" />,
    },
};

/** Returns { idle, active } tailwind classes for a feedback tile. */
export function feedbackTileClasses(value: string): { idle: string; active: string; iconIdle: string; iconActive: string } {
    const map: Record<string, { idle: string; active: string; iconIdle: string; iconActive: string }> = {
        wrong_number:      { idle: 'bg-white border-red-100 text-red-600',     active: 'bg-red-500 border-red-600 text-white',     iconIdle: 'bg-red-50',     iconActive: 'bg-red-400/30' },
        no_answer:             { idle: 'bg-white border-slate-200 text-slate-500',  active: 'bg-slate-600 border-slate-700 text-white',  iconIdle: 'bg-slate-100',  iconActive: 'bg-white/20' },
        no_answer_first_call:  { idle: 'bg-white border-slate-200 text-slate-400',  active: 'bg-slate-500 border-slate-600 text-white',  iconIdle: 'bg-slate-50',   iconActive: 'bg-white/20' },
        follow_up:         { idle: 'bg-white border-amber-100 text-amber-600',  active: 'bg-amber-500 border-amber-600 text-white',  iconIdle: 'bg-amber-50',   iconActive: 'bg-amber-400/30' },
        rotation:          { idle: 'bg-white border-violet-100 text-violet-600',active: 'bg-violet-600 border-violet-700 text-white',iconIdle: 'bg-violet-50',  iconActive: 'bg-white/20' },
        cold_call:         { idle: 'bg-white border-cyan-100 text-cyan-600',    active: 'bg-cyan-600 border-cyan-700 text-white',    iconIdle: 'bg-cyan-50',    iconActive: 'bg-white/20' },
        purchased:         { idle: 'bg-white border-green-100 text-green-600',  active: 'bg-green-500 border-green-600 text-white',  iconIdle: 'bg-green-50',   iconActive: 'bg-green-400/30' },
        assigned:          { idle: 'bg-white border-slate-200 text-slate-500',  active: 'bg-slate-600 border-slate-700 text-white',  iconIdle: 'bg-slate-100',  iconActive: 'bg-white/20' },
        qualified:         { idle: 'bg-white border-blue-100 text-blue-600',    active: 'bg-blue-500 border-blue-600 text-white',    iconIdle: 'bg-blue-50',    iconActive: 'bg-blue-400/30' },
        new_lead:          { idle: 'bg-white border-emerald-100 text-emerald-600', active: 'bg-emerald-500 border-emerald-600 text-white', iconIdle: 'bg-emerald-50', iconActive: 'bg-emerald-400/30' },
        not_interested:    { idle: 'bg-white border-rose-100 text-rose-600',    active: 'bg-rose-500 border-rose-600 text-white',    iconIdle: 'bg-rose-50',    iconActive: 'bg-rose-400/30' },
        switched_off:      { idle: 'bg-white border-slate-200 text-slate-500',  active: 'bg-slate-500 border-slate-600 text-white',  iconIdle: 'bg-slate-100',  iconActive: 'bg-white/20' },
        meeting_cancelled: { idle: 'bg-white border-slate-200 text-slate-500',  active: 'bg-slate-500 border-slate-600 text-white',  iconIdle: 'bg-slate-100',  iconActive: 'bg-white/20' },
        closed:            { idle: 'bg-white border-slate-200 text-slate-500',  active: 'bg-slate-600 border-slate-700 text-white',  iconIdle: 'bg-slate-100',  iconActive: 'bg-white/20' },
        lost:              { idle: 'bg-white border-red-100 text-red-500',      active: 'bg-red-600 border-red-700 text-white',      iconIdle: 'bg-red-50',     iconActive: 'bg-white/20' },
    };
    return map[value] ?? { idle: 'bg-white border-slate-200 text-slate-500', active: 'bg-slate-600 border-slate-700 text-white', iconIdle: 'bg-slate-100', iconActive: 'bg-white/20' };
}

/** @deprecated use feedbackTileClasses */
export function feedbackTileTone(value: string) {
    return feedbackTileClasses(value).idle;
}

export function resolveFeedbackGridTile(value: string): Pick<StageOption, 'value' | 'label' | 'colorClass' | 'icon'> {
    const fromOptions = LEAD_STAGE_OPTIONS.find((o) => o.value === value);
    const fb = FEEDBACK_GRID_FALLBACK[value];
    /** Tile copy always comes from i18n (`translateLeadStatus`); keep label neutral here. */
    if (fromOptions) return { ...fromOptions, label: '' };
    return {
        value,
        label: '',
        colorClass: fb?.colorClass ?? 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-foreground/10 dark:text-foreground',
        icon: fb?.icon ?? <MessageSquare className="h-5 w-5 opacity-70" />,
    };
}
