import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Bookmark, Home, Phone, Trash2, Users, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { getLeadById } from '../services/api';
import { getUserRoleName } from '../lib/userRole';
import {
    getSavedLeads,
    setSavedLeads,
    getSavedUnits,
    setSavedUnits,
    toggleSavedLead,
    toggleSavedUnit,
    type SavedLeadItem,
    type SavedUnitItem,
} from '../lib/savedItems';

export default function SavedItems() {
    const { t, i18n } = useTranslation();
    const isRtl = i18n.language?.toLowerCase().startsWith('ar');
    const user = useSelector((state: any) => state.user.user);
    const roleName = getUserRoleName(user);
    const isSales = roleName === 'sales';
    const currentUserId = Number(user?.id);
    const [leadItems, setLeadItems] = useState<SavedLeadItem[]>(() => getSavedLeads());
    const [unitItems, setUnitItems] = useState<SavedUnitItem[]>(() => getSavedUnits());
    const [filterType, setFilterType] = useState<'all' | 'leads' | 'units'>('all');

    const hasItems = useMemo(() => leadItems.length > 0 || unitItems.length > 0, [leadItems.length, unitItems.length]);
    const totalItems = leadItems.length + unitItems.length;
    const showLeads = filterType === 'all' || filterType === 'leads';
    const showUnits = filterType === 'all' || filterType === 'units';

    useEffect(() => {
        if (isSales) return;
        setSavedLeads([]);
        setSavedUnits([]);
        setLeadItems([]);
        setUnitItems([]);
    }, [isSales]);

    useEffect(() => {
        if (!isSales || !Number.isFinite(currentUserId)) return;
        let cancelled = false;

        const pruneInvalidSavedLeads = async () => {
            const currentSaved = getSavedLeads();
            if (currentSaved.length === 0) {
                if (!cancelled) setLeadItems([]);
                return;
            }
            const checks = await Promise.all(
                currentSaved.map(async (item) => {
                    try {
                        const lead = await getLeadById(item.id);
                        const ownerId =
                            Number(lead?.assignedTo) ||
                            Number(lead?.assignedUser?.id) ||
                            Number(lead?.assignedUserId);
                        return ownerId === currentUserId ? item : null;
                    } catch {
                        return null;
                    }
                }),
            );
            const next = checks.filter((x): x is SavedLeadItem => x != null);
            setSavedLeads(next);
            if (!cancelled) setLeadItems(next);
        };

        pruneInvalidSavedLeads();
        return () => {
            cancelled = true;
        };
    }, [isSales, currentUserId]);

    if (!isSales) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="space-y-6 p-4 md:p-8" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="rounded-[2.25rem] border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B1828] text-white shadow-lg shadow-[#0B1828]/20">
                            <Bookmark className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-[#0B1828]">{t('saved.title', { defaultValue: 'Saved Items' })}</h1>
                            <p className="text-sm font-semibold text-slate-500">
                                {t('saved.subtitle', { defaultValue: 'Leads and units you bookmarked for quick access' })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500">
                        <span>{t('saved.filterAll', { defaultValue: 'All' })}</span>
                        <span className="rounded-lg bg-[#0B1828] px-2 py-1 text-white tabular-nums">{totalItems}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setFilterType('all')}
                        className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                            filterType === 'all'
                                ? 'bg-[#0B1828] text-white shadow-md shadow-[#0B1828]/20'
                                : 'bg-slate-50 text-[#0B1828] hover:bg-slate-100'
                        }`}
                    >
                        {t('saved.filterAll', { defaultValue: 'All' })} ({totalItems})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('leads')}
                        className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                            filterType === 'leads'
                                ? 'bg-[#0B1828] text-white shadow-md shadow-[#0B1828]/20'
                                : 'bg-slate-50 text-[#0B1828] hover:bg-slate-100'
                        }`}
                    >
                        {t('saved.leads', { defaultValue: 'Saved Leads' })} ({leadItems.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterType('units')}
                        className={`rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-all ${
                            filterType === 'units'
                                ? 'bg-[#0B1828] text-white shadow-md shadow-[#0B1828]/20'
                                : 'bg-slate-50 text-[#0B1828] hover:bg-slate-100'
                        }`}
                    >
                        {t('saved.units', { defaultValue: 'Saved Units' })} ({unitItems.length})
                    </button>
                </div>
            </div>

            {!hasItems ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                        <Bookmark className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-500">
                        {t('saved.empty', { defaultValue: 'No saved leads or units yet.' })}
                    </p>
                </div>
            ) : null}

            {showLeads && leadItems.length > 0 ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[#0B1828]" />
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                {t('saved.leads', { defaultValue: 'Saved Leads' })}
                            </h2>
                        </div>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 tabular-nums">{leadItems.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {leadItems.map((lead) => (
                            <div key={`saved-lead-${lead.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#0B1828]/20 hover:shadow-md">
                                <div className="flex items-start justify-between gap-3">
                                    <Link to={`/leads/${lead.id}`} className="group block min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-sm font-black text-[#0B1828] group-hover:underline">
                                                {lead.name || `Lead #${lead.id}`}
                                            </p>
                                            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-[#0B1828]" />
                                        </div>
                                        {lead.phone ? (
                                            <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500" dir="ltr">
                                                <Phone className="h-3.5 w-3.5" />
                                                {lead.phone}
                                            </p>
                                        ) : null}
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            toggleSavedLead(lead);
                                            setLeadItems(getSavedLeads());
                                        }}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition-colors hover:bg-rose-600 hover:text-white"
                                        title={t('saved.remove', { defaultValue: 'Remove' })}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : showLeads && hasItems ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-500">
                        {t('saved.empty', { defaultValue: 'No saved leads or units yet.' })}
                    </p>
                </div>
            ) : null}

            {showUnits && unitItems.length > 0 ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Home className="h-4 w-4 text-[#0B1828]" />
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
                                {t('saved.units', { defaultValue: 'Saved Units' })}
                            </h2>
                        </div>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 tabular-nums">{unitItems.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {unitItems.map((unit) => (
                            <div key={`saved-unit-${unit.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#0B1828]/20 hover:shadow-md">
                                <div className="flex items-start justify-between gap-3">
                                    <Link to={`/units/${unit.id}`} className="group block min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-sm font-black text-[#0B1828] group-hover:underline">
                                                {unit.code || `Unit #${unit.id}`}
                                            </p>
                                            <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-[#0B1828]" />
                                        </div>
                                        {unit.projectName ? (
                                            <p className="mt-2 text-xs font-bold text-slate-500">{unit.projectName}</p>
                                        ) : null}
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            toggleSavedUnit(unit);
                                            setUnitItems(getSavedUnits());
                                        }}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition-colors hover:bg-rose-600 hover:text-white"
                                        title={t('saved.remove', { defaultValue: 'Remove' })}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : showUnits && hasItems ? (
                <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm font-bold text-slate-500">
                        {t('saved.empty', { defaultValue: 'No saved leads or units yet.' })}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

