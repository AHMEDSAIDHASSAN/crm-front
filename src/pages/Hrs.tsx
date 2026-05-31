import { useCallback, useEffect, useState } from 'react';
import {
    Clock3,
    LogIn,
    LogOut,
    Search,
    Phone,
    TrendingUp,
    Banknote,
    Plus,
    Trash2,
    Pencil,
    Loader2,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/Store';
import {
    getAttendanceRecords,
    getHrEmployees,
    setEmployeeSalary,
    getHrPolicies,
    createHrPolicy,
    updateHrPolicy,
    deleteHrPolicy,
    getHrPayroll,
    getAllTeams
} from '../services/api';
import { toast } from '../lib/toast';
import { useTranslation } from 'react-i18next';
import { getRoleDisplayName } from '../lib/userRole';
import { isAppRtl } from '../lib/i18nDirection';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from '../components/ui/Modal';
import { formatMoney } from '../lib/currency';

// â”€â”€ map icons â”€â”€
const cairoCenter: [number, number] = [30.0444, 31.2357];
const checkInIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const checkOutIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

function formatTime(value: string | null, locale?: string) {
    if (!value) return '\u2014';
    const loc = locale?.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
    return new Date(value).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}

function parseLocation(value: unknown): { lat: number; lng: number } | null {
    if (!value) return null;
    if (typeof value === 'object' && value !== null && 'lat' in (value as any) && 'lng' in (value as any)) {
        const lat = Number((value as any).lat);
        const lng = Number((value as any).lng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    }
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            const lat = Number((parsed as any).lat ?? (parsed as any).latitude);
            const lng = Number((parsed as any).lng ?? (parsed as any).longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        }
    } catch { /* ignore */ }
    const parts = raw.split(',').map((p) => Number(p.trim()));
    if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return { lat: parts[0], lng: parts[1] };
    }
    return null;
}



type AttendanceRecord = {
    id: string; userId: number; name: string;
    phone: string | null; team: string | null;
    checkInAt: string | null; checkOutAt: string | null;
    checkInLocation: { lat: number; lng: number } | null;
    checkOutLocation: { lat: number; lng: number } | null;
    isLate: boolean; lateMinutes: number | null;
};

type Tab = 'attendance' | 'policy' | 'payroll';

export default function Hrs() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const currentUser = useSelector((state: RootState) => state.user.user);
    const roleName = currentUser?.role?.name ?? '';
    const canAccess = roleName === 'super_admin' || roleName === 'hr';
    const canSeeSalary = canAccess;

    const [tab, setTab] = useState<Tab>('attendance');

    if (!canAccess) {
        return (
            <div dir={isRtl ? 'rtl' : 'ltr'} className="rounded-2xl border border-sira-border bg-sira-bg-card p-6">
                <h2 className="text-xl font-black uppercase italic text-foreground">{t('hrModule.accessDeniedTitle')}</h2>
                <p className="mt-2 text-foreground/60">{t('hrModule.accessDeniedBody')}</p>
            </div>
        );
    }

    const tabItems: { key: Tab; labelKey: 'hrModule.tabAttendance' | 'hrModule.tabPolicy' | 'hrModule.tabPayroll' }[] = [
        { key: 'attendance', labelKey: 'hrModule.tabAttendance' },
        { key: 'policy', labelKey: 'hrModule.tabPolicy' },
        { key: 'payroll', labelKey: 'hrModule.tabPayroll' },
    ];

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-sira-border pb-2">
                <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">{t('hrModule.intro')}</p>
            </div>

            <div className="flex w-fit gap-1 rounded-xl border border-sira-border bg-foreground/5 p-1">
                {tabItems.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setTab(item.key)}
                        className={`rounded-lg px-4 py-2 text-xs font-black uppercase tracking-wider transition-all ${tab === item.key ? 'border border-secondary/30 bg-sira-gold/20 text-sira-gold' : 'border border-transparent text-foreground/50 hover:bg-foreground/5 hover:text-foreground'}`}
                    >
                        {t(item.labelKey)}
                    </button>
                ))}
            </div>

            {tab === 'attendance' && <AttendanceTab canSeeSalary={canSeeSalary} />}
            {tab === 'policy' && <PolicyTab />}
            {tab === 'payroll' && <PayrollTab />}
        </div>
    );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 1: ATTENDANCE & PERFORMANCE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function AttendanceTab({ canSeeSalary }: { canSeeSalary: boolean }) {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const lang = i18n.language;
    const [employees, setEmployees] = useState<any[]>([]);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [empPage, setEmpPage] = useState(1);

    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [totalAttendance, setTotalAttendance] = useState(0);
    const [attPage, setAttPage] = useState(1);

    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [teams, setTeams] = useState<any[]>([]);
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
    const [salaryModal, setSalaryModal] = useState<any>(null);
    const [salaryValue, setSalaryValue] = useState('');
    const [salaryLoading, setSalaryLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [empRes, attRes, teamsRes] = await Promise.all([
                getHrEmployees({
                    page: empPage,
                    limit: 10,
                    search: search || undefined
                }),
                getAttendanceRecords({
                    date: selectedDate,
                    teamId: selectedTeamId || undefined,
                    page: attPage,
                    limit: 10,
                    search: search || undefined
                }),
                getAllTeams()
            ]);
            const empData = empRes?.data ?? [];
            setEmployees(empData);
            setTotalEmployees(empRes?.meta?.total ?? empData.length);

            setTeams(Array.isArray(teamsRes) ? teamsRes : []);

            const attData = attRes?.data ?? [];
            setTotalAttendance(attRes?.meta?.total ?? attData.length);
            const records: AttendanceRecord[] = attData
                .map((item: any) => ({
                    id: String(item.id),
                    userId: Number(item.userId),
                    name:
                        `${item.user?.firstName || ''} ${item.user?.lastName || ''}`.trim() ||
                        t('hrModule.userNumber', { id: item.userId }),
                    phone: item.user?.phone || null,
                    team: item.user?.team?.name || null,
                    checkInAt: item.checkInTime ? String(item.checkInTime) : null,
                    checkOutAt: item.checkOutTime ? String(item.checkOutTime) : null,
                    checkInLocation: parseLocation(item.checkInLocation),
                    checkOutLocation: parseLocation(item.checkOutLocation),
                    isLate: Boolean(item.isLate),
                    lateMinutes: item.lateMinutes ?? null,
                }));
            setAttendance(records);
        } catch {
            toast.error(t('hrModule.toastHrLoadFail'));
        } finally {
            setLoading(false);
        }
    }, [selectedDate, selectedTeamId, search, empPage, attPage, t]);

    useEffect(() => { load(); }, [load]);

    // Reset pages when filters change
    useEffect(() => { setEmpPage(1); }, [search]);
    useEffect(() => { setAttPage(1); }, [selectedDate, selectedTeamId, search]);

    const empTotalPages = Math.ceil(totalEmployees / 10);
    const attTotalPages = Math.ceil(totalAttendance / 10);

    // â”€â”€ Filtered employees (search by name, email, phone, team) â”€â”€
    const paginatedEmployees = employees;
    const paginatedAttendance = attendance;

    const handleSalarySubmit = async () => {
        if (!salaryModal) return;
        const val = Number(salaryValue);
        if (Number.isNaN(val) || val < 0) {
            toast.error(t('hrModule.toastInvalidSalary'));
            return;
        }
        setSalaryLoading(true);
        try {
            await setEmployeeSalary(salaryModal.id, val);
            toast.success(t('hrModule.toastSalaryUpdated'));
            setSalaryModal(null);
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || t('hrModule.toastSalaryFail'));
        } finally {
            setSalaryLoading(false);
        }
    };

    // â”€â”€ Reusable pagination bar â”€â”€
    const PaginationBar = ({ page, totalPages, total, onPrev, onNext }: { page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void }) => (
        <div className="flex items-center justify-between border-t border-foreground/5 px-5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/40">
                {t('hrModule.showingPage', { page, totalPages, total })}
            </p>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onPrev}
                    disabled={page <= 1}
                    className="rounded-lg border border-sira-border px-3 py-1.5 text-[10px] font-black uppercase text-foreground/60 transition-colors hover:bg-foreground/5 disabled:opacity-30"
                >
                    {t('salesProfile.previous')}
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={page >= totalPages}
                    className="rounded-lg border border-sira-border px-3 py-1.5 text-[10px] font-black uppercase text-foreground/60 transition-colors hover:bg-foreground/5 disabled:opacity-30"
                >
                    {t('salesProfile.next')}
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* filters */}
            <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
                <div className="relative max-w-md flex-1">
                    <Search
                        className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30 ${isRtl ? 'right-4' : 'left-4'}`}
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('hrModule.searchEmployees')}
                        className={`w-full rounded-xl border border-sira-border bg-sira-bg-card py-3 text-sm text-foreground focus:border-secondary/50 focus:outline-none ${isRtl ? 'pr-11 pl-4' : 'pl-11 pr-4'}`}
                    />
                </div>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="rounded-xl border border-sira-border bg-sira-bg-card px-3 py-2.5 text-sm text-foreground focus:border-secondary/50 focus:outline-none"
                />
                <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="rounded-xl border border-sira-border bg-sira-bg-card px-3 py-2.5 text-sm text-foreground focus:border-secondary/50 focus:outline-none min-w-[150px]"
                >
                    <option value="">{t('agentsPage.allTeams')}</option>
                    {teams.map((tm: any) => (
                        <option key={String(tm.id)} value={String(tm.id)}>
                            {tm.name}
                        </option>
                    ))}
                </select>
            </div>

            {/* stats */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-foreground/5 bg-sira-bg-card p-5">
                    <p className="text-xs font-black uppercase tracking-wide text-foreground/40">{t('hrModule.statEmployees')}</p>
                    <p className="mt-2 text-3xl font-black text-foreground">{totalEmployees}</p>
                </div>
                <div className="rounded-3xl border border-foreground/5 bg-sira-bg-card p-5">
                    <p className="text-xs font-black uppercase tracking-wide text-foreground/40">{t('hrModule.statCheckedInToday')}</p>
                    <p className="mt-2 text-3xl font-black text-emerald-400">{totalAttendance}</p>
                </div>
            </div>

            {/* employee performance table */}
            <div className="bg-sira-bg-card rounded-[28px] border border-foreground/5 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-foreground/5 bg-white/[0.02]">
                                <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colEmployee')}
                                </th>
                                <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    Phone
                                </th>
                                <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colRole')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colColdCalls')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colMeetings')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colLate')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colPenalty')}
                                </th>
                                {canSeeSalary && (
                                    <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                        {t('hrModule.colSalary')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={canSeeSalary ? 8 : 7} className="px-5 py-10 text-center text-foreground/50">
                                        {t('hrModule.loading')}
                                    </td>
                                </tr>
                            ) : paginatedEmployees.length === 0 ? (
                                <tr>
                                    <td colSpan={canSeeSalary ? 8 : 7} className="px-5 py-10 text-center text-foreground/40">
                                        {t('hrModule.noEmployees')}
                                    </td>
                                </tr>
                            ) : paginatedEmployees.map((emp: any) => (
                                <tr key={String(emp.id)} className="border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] transition-colors">
                                    <td className="px-5 py-4 text-start">
                                        <div className="flex flex-col">
                                            <p className="text-foreground font-bold text-sm">{emp.firstName} {emp.lastName}</p>
                                            <p className="text-foreground/30 text-xs">{emp.email}</p>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-start">
                                        {emp.phone ? (
                                            <div className="flex items-center gap-1.5 text-xs text-foreground/60">
                                                <Phone className="w-3 h-3 text-foreground/30" />
                                                <span>{emp.phone}</span>
                                            </div>
                                        ) : (
                                            <span className="text-foreground/20 text-xs">—</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-start">
                                        <div className="flex flex-col">
                                            <p className="text-foreground/60 text-xs uppercase font-bold">{getRoleDisplayName(emp.role, t) || '—'}</p>
                                            {emp.team?.name && <p className="text-foreground/25 text-[10px] mt-0.5">{emp.team.name}</p>}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-300">
                                            <Phone className="w-3.5 h-3.5" />
                                            <span>{emp.performance?.coldCalls ?? 0}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-300">
                                            <TrendingUp className="w-3.5 h-3.5" />
                                            <span>{emp.performance?.meetings ?? 0}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`text-sm font-bold ${emp.performance?.lateCount > 0 ? 'text-amber-400' : 'text-foreground/40'}`}>
                                            {emp.performance?.lateCount ?? 0}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-center">
                                        <span className={`text-sm font-bold ${(emp.performance?.totalPenalty ?? 0) > 0 ? 'text-red-400' : 'text-foreground/40'}`}>
                                            {formatMoney(emp.performance?.totalPenalty ?? 0, lang)}
                                        </span>
                                    </td>
                                    {canSeeSalary && (
                                        <td className="px-5 py-4 text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSalaryModal(emp);
                                                    setSalaryValue(String(emp.salary != null ? Number(emp.salary) : ''));
                                                }}
                                                className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-sira-gold transition-colors hover:text-sira-gold/80"
                                            >
                                                <Banknote className="h-3.5 w-3.5" />
                                                <span>{emp.salary != null ? formatMoney(emp.salary, lang) : t('hrModule.setSalary')}</span>
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && empTotalPages > 1 && (
                    <PaginationBar
                        page={empPage}
                        totalPages={empTotalPages}
                        total={totalEmployees}
                        onPrev={() => setEmpPage((p) => Math.max(1, p - 1))}
                        onNext={() => setEmpPage((p) => Math.min(empTotalPages, p + 1))}
                    />
                )}
            </div>

            {/* attendance table */}
            <div className="bg-sira-bg-card rounded-[28px] border border-foreground/5 overflow-hidden">
                <div className="border-b border-foreground/5 px-5 py-4">
                    <h3 className="text-sm font-black uppercase text-foreground/60">
                        {t('hrModule.attendanceForDate', { date: selectedDate })}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-foreground/5 bg-white/[0.02]">
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colEmployee')}
                                </th>
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colCheckIn')}
                                </th>
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colCheckOut')}
                                </th>
                                <th className="px-5 py-3 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colLate')}
                                </th>
                                <th className="px-5 py-3 text-end text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colDetails')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedAttendance.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-foreground/40">
                                        {t('hrModule.noAttendanceForDate')}
                                    </td>
                                </tr>
                            ) : (
                                paginatedAttendance.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-5 py-3 text-start">
                                            <div className="flex flex-col">
                                                <p className="text-sm font-bold text-foreground">{row.name}</p>
                                                {row.phone && (
                                                    <div className="text-[10px] text-foreground/25 flex items-center gap-1 mt-0.5">
                                                        <Phone className="w-2.5 h-2.5" />
                                                        <span>{row.phone}</span>
                                                    </div>
                                                )}
                                                {row.team && <p className="text-[10px] text-foreground/20 mt-0.5">{row.team}</p>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-start gap-1.5 text-sm text-emerald-400">
                                                <LogIn className="h-4 w-4" />
                                                <span>{formatTime(row.checkInAt, lang)}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-start gap-1.5 text-sm text-red-400">
                                                <LogOut className="h-4 w-4" />
                                                <span>{row.checkOutAt ? formatTime(row.checkOutAt, lang) : t('hrModule.pending')}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-start">
                                                {row.isLate ? (
                                                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                                                        <Clock3 className="h-3.5 w-3.5" />
                                                        <span>{t('hrModule.lateMinutesShort', { count: row.lateMinutes ?? 0 })}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-foreground/40">{t('hrModule.onTime')}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-end">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedRecord(row)}
                                                className="rounded-lg bg-sira-gold/15 px-3 py-1.5 text-xs font-black uppercase text-sira-gold transition-colors hover:bg-sira-gold/25"
                                            >
                                                {t('hrModule.view')}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {!loading && attTotalPages > 1 && (
                    <PaginationBar
                        page={attPage}
                        totalPages={attTotalPages}
                        total={totalAttendance}
                        onPrev={() => setAttPage((p) => Math.max(1, p - 1))}
                        onNext={() => setAttPage((p) => Math.min(attTotalPages, p + 1))}
                    />
                )}
            </div>

            {/* detail modal */}
            <Modal
                isOpen={Boolean(selectedRecord)}
                onClose={() => setSelectedRecord(null)}
                title={t('hrModule.modalAttendanceTitle')}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                {selectedRecord && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-sira-border bg-foreground/5 p-3">
                                <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.colEmployee')}</p>
                                <p className="mt-1 font-bold text-foreground">{selectedRecord.name}</p>
                            </div>
                            <div className="rounded-xl border border-sira-border bg-foreground/5 p-3">
                                <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.colLate')}</p>
                                <p
                                    className={`mt-1 font-bold ${selectedRecord.isLate ? 'text-amber-400' : 'text-emerald-400'}`}
                                >
                                    {selectedRecord.isLate
                                        ? t('hrModule.lateMinutesLate', { count: selectedRecord.lateMinutes ?? 0 })
                                        : t('hrModule.onTime')}
                                </p>
                            </div>
                            <div className="rounded-xl border border-sira-border bg-foreground/5 p-3">
                                <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.colCheckIn')}</p>
                                <p className="mt-1 font-bold text-emerald-400">{formatTime(selectedRecord.checkInAt, lang)}</p>
                            </div>
                            <div className="rounded-xl border border-sira-border bg-foreground/5 p-3">
                                <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.colCheckOut')}</p>
                                <p className="mt-1 font-bold text-red-400">
                                    {selectedRecord.checkOutAt
                                        ? formatTime(selectedRecord.checkOutAt, lang)
                                        : t('hrModule.pending')}
                                </p>
                            </div>
                        </div>
                        <div className="h-[300px] overflow-hidden rounded-2xl border border-sira-border">
                            <MapContainer
                                center={
                                    selectedRecord.checkInLocation
                                        ? [selectedRecord.checkInLocation.lat, selectedRecord.checkInLocation.lng]
                                        : cairoCenter
                                }
                                zoom={13}
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    attribution="&copy; OpenStreetMap"
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                {selectedRecord.checkInLocation && (
                                    <Marker
                                        position={[
                                            selectedRecord.checkInLocation.lat,
                                            selectedRecord.checkInLocation.lng,
                                        ]}
                                        icon={checkInIcon}
                                    >
                                        <Popup>
                                            {t('hrModule.popupMapCheckIn', {
                                                time: formatTime(selectedRecord.checkInAt, lang),
                                            })}
                                        </Popup>
                                    </Marker>
                                )}
                                {selectedRecord.checkOutLocation && (
                                    <Marker
                                        position={[
                                            selectedRecord.checkOutLocation.lat,
                                            selectedRecord.checkOutLocation.lng,
                                        ]}
                                        icon={checkOutIcon}
                                    >
                                        <Popup>
                                            {t('hrModule.popupMapCheckOut', {
                                                time: formatTime(selectedRecord.checkOutAt, lang),
                                            })}
                                        </Popup>
                                    </Marker>
                                )}
                            </MapContainer>
                        </div>
                        {!selectedRecord.checkInLocation && !selectedRecord.checkOutLocation && (
                            <p className="text-sm text-foreground/50">{t('hrModule.noLocationData')}</p>
                        )}
                    </div>
                )}
            </Modal>

            {/* salary modal */}
            <Modal
                isOpen={Boolean(salaryModal)}
                onClose={() => setSalaryModal(null)}
                title={
                    salaryModal
                        ? t('hrModule.modalSalaryTitle', {
                            name: `${salaryModal.firstName} ${salaryModal.lastName}`.trim(),
                        })
                        : t('hrModule.salary')
                }
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                {salaryModal && (
                    <div className="space-y-4 p-2">
                        <p className="text-sm text-foreground/60">
                            {t('hrModule.currentSalary')}{' '}
                            <span className="font-bold text-foreground">
                                {salaryModal.salary != null ? formatMoney(salaryModal.salary, lang) : t('hrModule.notSet')}
                            </span>
                        </p>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                                {t('hrModule.monthlySalaryEgp')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={salaryValue}
                                onChange={(e) => setSalaryValue(e.target.value)}
                                className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-sm text-foreground focus:border-secondary focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setSalaryModal(null)}
                                className="flex-1 rounded-xl border border-sira-border py-3 text-xs font-bold uppercase text-foreground/70 hover:bg-foreground/5"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={handleSalarySubmit}
                                disabled={salaryLoading}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sira-gold py-3 text-xs font-black uppercase text-primary hover:bg-sira-gold/90 disabled:opacity-50"
                            >
                                {salaryLoading && <Loader2 className="h-4 w-4 animate-spin" />} {t('hrModule.save')}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 2: POLICY
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function PolicyTab() {
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const lang = i18n.language;
    const [policies, setPolicies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<any>(null);
    const [form, setForm] = useState({ name: '', shiftStartTime: '09:00', shiftEndTime: '17:00', graceMinutes: 0, penaltyPerHour: 0, isActive: true });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getHrPolicies();
            setPolicies(Array.isArray(data) ? data : data?.data ?? []);
        } catch {
            toast.error(t('hrModule.toastPoliciesLoadFail'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', shiftStartTime: '09:00', shiftEndTime: '17:00', graceMinutes: 0, penaltyPerHour: 0, isActive: true });
        setFormOpen(true);
    };
    const openEdit = (p: any) => {
        setEditing(p);
        setForm({ name: p.name, shiftStartTime: p.shiftStartTime, shiftEndTime: p.shiftEndTime, graceMinutes: p.graceMinutes ?? 0, penaltyPerHour: Number(p.penaltyPerHour ?? 0), isActive: p.isActive ?? true });
        setFormOpen(true);
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            toast.error(t('hrModule.toastNameRequired'));
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await updateHrPolicy(editing.id, form);
                toast.success(t('hrModule.toastPolicyUpdated'));
            } else {
                await createHrPolicy(form);
                toast.success(t('hrModule.toastPolicyCreated'));
            }
            setFormOpen(false);
            load();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || t('hrModule.toastSaveFail'));
        } finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id: number) => {
        if (!window.confirm(t('hrModule.confirmDeletePolicy'))) return;
        try {
            await deleteHrPolicy(id);
            toast.success(t('hrModule.toastPolicyDeleted'));
            load();
        } catch {
            toast.error(t('hrModule.toastPolicyDeleteFail'));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h3 className="text-sm font-black uppercase text-foreground/60">{t('hrModule.policyTitle')}</h3>
                    <p className="mt-1 text-xs text-foreground/40">{t('hrModule.policySubtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-2 rounded-2xl bg-sira-gold px-6 py-3 text-xs font-black uppercase text-primary shadow-lg shadow-secondary/20 transition-all hover:scale-[1.02] active:scale-95"
                >
                    <Plus className="h-4 w-4" /> {t('hrModule.addPolicy')}
                </button>
            </div>

            {loading ? (
                <div className="p-12 text-center text-foreground/50">{t('hrModule.loading')}</div>
            ) : policies.length === 0 ? (
                <div className="rounded-3xl border border-foreground/5 bg-sira-bg-card p-12 text-center text-muted-foreground">
                    {t('hrModule.noPoliciesYet')}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {policies.map((p: any) => (
                        <div
                            key={p.id}
                            className={`space-y-3 rounded-3xl border bg-sira-bg-card p-5 ${p.isActive ? 'border-secondary/30' : 'border-foreground/5 opacity-60'}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-foreground">{p.name}</h4>
                                    {p.isActive && (
                                        <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-400">
                                            {t('hrModule.activeBadge')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() => openEdit(p)}
                                        className="rounded-xl bg-foreground/5 p-2 text-foreground/60 transition-all hover:bg-sira-gold/20 hover:text-sira-gold"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(p.id)}
                                        className="rounded-xl bg-foreground/5 p-2 text-foreground/60 transition-all hover:bg-red-500/20 hover:text-red-400"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.shift')}</p>
                                    <p className="mt-1 text-sm font-bold text-foreground">
                                        {p.shiftStartTime}
                                        {' — '}
                                        {p.shiftEndTime}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase text-foreground/40">{t('hrModule.grace')}</p>
                                    <p className="mt-1 text-sm font-bold text-foreground">
                                        {t('hrModule.graceMinutes', { count: p.graceMinutes ?? 0 })}
                                    </p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[10px] font-black uppercase text-foreground/40">
                                        {t('hrModule.penaltyPerLateHour')}
                                    </p>
                                    <p className="mt-1 text-sm font-bold text-red-400">{formatMoney(p.penaltyPerHour, lang)}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title={editing ? t('hrModule.modalEditPolicy') : t('hrModule.modalCreatePolicy')}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <form onSubmit={handleSubmit} className="space-y-4 p-2">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                            {t('hrModule.name')}
                        </label>
                        <input
                            required
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-xs text-foreground focus:border-secondary focus:outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                                {t('hrModule.shiftStart')}
                            </label>
                            <input
                                type="time"
                                value={form.shiftStartTime}
                                onChange={(e) => setForm({ ...form, shiftStartTime: e.target.value })}
                                className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-xs text-foreground focus:border-secondary focus:outline-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                                {t('hrModule.shiftEnd')}
                            </label>
                            <input
                                type="time"
                                value={form.shiftEndTime}
                                onChange={(e) => setForm({ ...form, shiftEndTime: e.target.value })}
                                className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-xs text-foreground focus:border-secondary focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                                {t('hrModule.graceMin')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={form.graceMinutes}
                                onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })}
                                className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-xs text-foreground focus:border-secondary focus:outline-none"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                                {t('hrModule.penaltyHrEgp')}
                            </label>
                            <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={form.penaltyPerHour}
                                onChange={(e) => setForm({ ...form, penaltyPerHour: Number(e.target.value) })}
                                className="w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-3 text-xs text-foreground focus:border-secondary focus:outline-none"
                            />
                        </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            checked={form.isActive}
                            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                            className="rounded border-foreground/20 bg-foreground/40"
                        />
                        <span className="text-sm font-bold text-foreground">{t('hrModule.active')}</span>
                    </label>
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setFormOpen(false)}
                            className="flex-1 rounded-xl border border-sira-border py-3 text-xs font-bold uppercase text-foreground/70 hover:bg-foreground/5"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sira-gold py-3 text-xs font-black uppercase text-primary hover:bg-sira-gold/90 disabled:opacity-50"
                        >
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
                            {editing ? t('hrModule.update') : t('hrModule.create')}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// TAB 3: PAYROLL
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function PayrollTab() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language;
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await getHrPayroll();
                setData(res);
            } catch {
                toast.error(t('hrModule.toastPayrollLoadFail'));
            } finally {
                setLoading(false);
            }
        })();
    }, [t]);

    if (loading)
        return (
            <div className="p-12 text-center text-foreground/50">
                <Loader2 className="inline-block h-6 w-6 animate-spin" /> {t('hrModule.payrollLoading')}
            </div>
        );
    if (!data) return <div className="p-12 text-center text-foreground/40">{t('hrModule.noPayrollData')}</div>;

    const employees = data.employees ?? [];
    const policy = data.policy;

    return (
        <div className="space-y-6">
            {policy && (
                <div className="rounded-3xl border border-secondary/20 bg-sira-bg-card p-5">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-sira-gold/60">
                        {t('hrModule.activePolicy')}
                    </p>
                    <div className="flex flex-wrap gap-6 text-sm text-foreground">
                        <span>
                            <strong>{policy.name}</strong>
                        </span>
                        <span>
                            {t('hrModule.shiftRange', {
                                start: policy.shiftStartTime,
                                end: policy.shiftEndTime,
                            })}
                        </span>
                        <span>{t('hrModule.graceLabel', { count: policy.graceMinutes ?? 0 })}</span>
                        <span>
                            {t('hrModule.penaltyPerHr', {
                                amount: formatMoney(policy.penaltyPerHour, lang),
                            })}
                        </span>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-[28px] border border-foreground/5 bg-sira-bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-foreground/5 bg-white/[0.02]">
                                <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colEmployee')}
                                </th>
                                <th className="px-5 py-4 text-start text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colRole')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colSalary')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colLateCount')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colLateMins')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-foreground/40">
                                    {t('hrModule.colDeduction')}
                                </th>
                                <th className="px-5 py-4 text-center text-[10px] font-black uppercase tracking-wider text-sira-gold/70">
                                    {t('hrModule.colNetSalary')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-10 text-center text-foreground/40">
                                        {t('hrModule.noEmployeesPayroll')}
                                    </td>
                                </tr>
                            ) : (
                                employees.map((emp: any) => (
                                    <tr
                                        key={String(emp.id)}
                                        className="border-b border-white/[0.03] transition-colors last:border-0 hover:bg-white/[0.02]"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="text-sm font-bold text-foreground">
                                                {emp.firstName} {emp.lastName}
                                            </p>
                                            {emp.team?.name && <p className="text-xs text-foreground/30">{emp.team.name}</p>}
                                        </td>
                                        <td className="px-5 py-4 text-xs font-bold uppercase text-foreground/60">
                                            {getRoleDisplayName(emp.role, t) || '—'}
                                        </td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-foreground">
                                            {formatMoney(emp.salary, lang)}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span
                                                className={`text-sm font-bold ${emp.lateCount > 0 ? 'text-amber-400' : 'text-foreground/40'}`}
                                            >
                                                {emp.lateCount}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center text-sm text-foreground/60">
                                            {t('hrModule.lateMinsValue', { count: emp.totalLateMinutes ?? 0 })}
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span
                                                className={`text-sm font-bold ${emp.totalPenalty > 0 ? 'text-red-400' : 'text-foreground/40'}`}
                                            >
                                                -{formatMoney(emp.totalPenalty, lang)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="text-sm font-black text-sira-gold">
                                                {formatMoney(emp.netSalary, lang)}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

