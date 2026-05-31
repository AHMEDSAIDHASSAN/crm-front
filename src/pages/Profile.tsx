import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { User, Mail, Shield, Users, TrendingUp, Home, Calendar } from 'lucide-react';
import { getDashboardStats } from '../services/api';
import { useTranslation } from 'react-i18next';
import { getRoleDisplayName } from '../lib/userRole';

const iconMap: Record<string, any> = {
    Users,
    Home,
    Calendar,
    TrendingUp,
};

export default function Profile() {
    const { t } = useTranslation();
    const user = useSelector((state: any) => state.user.user);
    const [stats, setStats] = useState<any[]>([]);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await getDashboardStats();
                setStats(data?.stats || []);
            } catch {
                setStats([]);
            } finally {
                setLoadingStats(false);
            }
        };
        fetchStats();
    }, []);

    if (!user) {
        return (
            <div className="text-foreground/60 text-center py-16">
                <p className="font-bold">{t('profile.loadingProfile')}</p>
            </div>
        );
    }

    const roleName = getRoleDisplayName(user.role, t) || '—';
    const initials = [user.firstName, user.lastName].map((n) => n?.[0]).filter(Boolean).join('').toUpperCase() || '?';

    return (
        <div className="space-y-12 pb-12 animate-in fade-in duration-500 pt-4">
            {/* Premium Header & Identity Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-1.5">
                    <h1 className="text-[32px] font-black text-sira-text-primary tracking-tighter uppercase">{t('profile.accountProfile') || 'Administrative Identity'}</h1>
                    <div className="flex items-center gap-3">
                        <div className="h-0.5 w-12 bg-sira-gold/40" />
                        <p className="text-[10px] font-black text-sira-text-muted uppercase tracking-[0.3em]">
                            {t('profile.personalGovernance') || 'Identity Management & Performance Oversight'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-[32px] border border-sira-border bg-sira-bg-card shadow-premium p-8 md:p-10">
                <div className="flex flex-col md:flex-row items-center gap-8 mb-10 pb-10 border-b border-sira-border/50">
                    <div className="w-24 h-24 rounded-[32px] bg-sira-brown flex items-center justify-center text-3xl font-black text-sira-gold border-4 border-sira-gold/10 shadow-premium active:scale-95 transition-transform">
                        {initials}
                    </div>
                    <div className="text-center md:text-start space-y-1">
                        <h2 className="text-2xl font-black text-sira-text-primary uppercase tracking-tight">
                            {user.firstName} {user.lastName}
                        </h2>
                        <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-1">
                            <span className="px-3 py-1 rounded-full bg-sira-gold text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
                                {roleName}
                            </span>
                            {user.team && (
                                <span className="px-3 py-1 rounded-full bg-sira-bg-subtle text-[9px] font-black uppercase tracking-widest text-sira-text-secondary border border-sira-border">
                                    {user.team.name}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="flex items-start gap-4 group">
                        <div className="p-3.5 rounded-2xl bg-sira-bg-subtle text-sira-gold border border-sira-border group-hover:scale-110 transition-transform">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] uppercase font-black text-sira-text-muted tracking-[0.15em]">{t('profile.fullName')}</p>
                            <p className="text-sira-text-primary font-black uppercase tracking-tight text-sm">{user.firstName} {user.lastName}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4 group">
                        <div className="p-3.5 rounded-2xl bg-sira-bg-subtle text-sira-gold border border-sira-border group-hover:scale-110 transition-transform">
                            <Mail className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                            <p className="text-[10px] uppercase font-black text-sira-text-muted tracking-[0.15em]">{t('profile.email')}</p>
                            <p className="text-sira-text-primary font-black tracking-tight text-sm truncate uppercase">{user.email || '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-4 group">
                        <div className="p-3.5 rounded-2xl bg-sira-bg-subtle text-sira-gold border border-sira-border group-hover:scale-110 transition-transform">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] uppercase font-black text-sira-text-muted tracking-[0.15em]">{t('profile.role')}</p>
                            <p className="text-sira-text-primary font-black uppercase tracking-tight text-sm">{roleName}</p>
                        </div>
                    </div>
                    {user.team && (
                        <div className="flex items-start gap-4 group">
                            <div className="p-3.5 rounded-2xl bg-sira-bg-subtle text-sira-gold border border-sira-border group-hover:scale-110 transition-transform">
                                <Users className="w-5 h-5" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] uppercase font-black text-sira-text-muted tracking-[0.15em]">{t('profile.team')}</p>
                                <p className="text-sira-text-primary font-black uppercase tracking-tight text-sm">{user.team.name || '—'}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                    <div className="h-2 w-2 rounded-full bg-sira-gold shadow-[0_0_10px_rgba(197,160,40,0.3)]" />
                    <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-sira-text-muted">{t('profile.performanceHighlights') || 'Metric Insights & Achievements'}</h2>
                </div>

                {loadingStats ? (
                    <div className="p-20 text-center text-sira-text-muted text-xs animate-pulse">
                        {t('profile.loadingStats')}
                    </div>
                ) : stats.length > 0 ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                        {stats.map((stat) => {
                            const Icon = iconMap[stat.icon] || Users;
                            return (
                                <div
                                    key={stat.label}
                                    className="bg-sira-bg-card border border-sira-border rounded-[32px] p-8 hover:border-sira-gold/50 transition-all shadow-sm group hover:-translate-y-1"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-sira-bg-subtle flex items-center justify-center text-sira-gold mb-6 border border-sira-border group-hover:bg-sira-gold/10 transition-colors">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <p className="text-sira-text-muted text-[9px] font-black uppercase tracking-[0.2em] mb-1.5">{stat.label}</p>
                                    <p className="text-3xl font-black text-sira-text-primary tracking-tighter">{stat.value}</p>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-12 text-center text-sira-text-muted text-xs rounded-[32px] border border-dashed border-sira-border">
                        {t('profile.noPerformanceData')}
                    </div>
                )}
            </div>
        </div>
    );
}

