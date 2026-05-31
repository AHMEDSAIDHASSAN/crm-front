import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Single hub for “Agents” (personnel) and “Sales teams” — Sira-style page chrome.
 */
export default function BrokerageHubLayout() {
    const { t } = useTranslation();
    const tabClass = ({ isActive }: { isActive: boolean }) =>
        `px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border ${isActive
            ? 'bg-[#0B1828] text-white border-[#0B1828] shadow-lg shadow-[#0B1828]/15'
            : 'border-transparent text-slate-500 hover:text-[#0B1828] hover:bg-slate-100'
        }`;


    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#BF9B30]">
                {t('brokerageHub.label')}
            </p>

            <div
                className="flex w-full flex-wrap gap-2 rounded-[2rem] border border-slate-200 bg-white p-1.5 shadow-sm sm:w-fit"
                role="tablist"
                aria-label={t('brokerageHub.ariaSections')}
            >
                <NavLink to="/brokerage/teams" className={tabClass} role="tab">
                    {t('brokerageHub.salesTeams')}
                </NavLink>
                <NavLink to="/brokerage/agents" end className={tabClass} role="tab">
                    {t('brokerageHub.agents')}
                </NavLink>
            </div>

            <Outlet />
        </div>
    );
}
