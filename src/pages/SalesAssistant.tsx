import { useState, useMemo } from 'react';
import { Calculator, Building2, FileText, ChevronDown, ChevronUp, Search, Printer, Home, MapPin, BedDouble, Square, User, Phone, Calendar, TrendingDown, Coins, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';
import { getUnits } from '../services/api';
import { useQuery } from '@tanstack/react-query';

// ─── Types ───────────────────────────────────────────────
type Tab = 'calc' | 'projects' | 'offer';
type Freq = 'monthly' | 'quarterly' | 'semi' | 'annual';

interface PayRow { period: number; label: string; amount: number; remaining: number; }

// ─── Helpers ─────────────────────────────────────────────
const fmt = (n: number) =>
    n.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function buildSchedule(remaining: number, years: number, freq: Freq): PayRow[] {
    const perYear: Record<Freq, number> = { monthly: 12, quarterly: 4, semi: 2, annual: 1 };
    const periods = years * perYear[freq];
    const labels: Record<Freq, (i: number, y: number) => string> = {
        monthly: (i) => `شهر ${i}`,
        quarterly: (i, y) => `ربع ${((i - 1) % 4) + 1} - سنة ${y}`,
        semi: (i, y) => `نصف ${((i - 1) % 2) + 1} - سنة ${y}`,
        annual: (_, y) => `سنة ${y}`,
    };
    const amount = remaining / periods;
    const rows: PayRow[] = [];
    for (let i = 1; i <= periods; i++) {
        const y = Math.ceil(i / perYear[freq]);
        rows.push({ period: i, label: labels[freq](i, y), amount, remaining: remaining - amount * i });
    }
    return rows;
}

// ─── Calculator Tab ────────────────────────────────────────
function CalcTab() {
    const [price, setPrice] = useState(3_000_000);
    const [dpPct, setDpPct] = useState(20);
    const [dpFixed, setDpFixed] = useState<number | null>(null);
    const [years, setYears] = useState(7);
    const [freq, setFreq] = useState<Freq>('quarterly');
    const [maintenance, setMaintenance] = useState(8);
    const [delivery, setDelivery] = useState(0);
    const [showTable, setShowTable] = useState(false);
    const [clientName, setClientName] = useState('');
    const [unitLabel, setUnitLabel] = useState('');

    const downPayment = dpFixed !== null ? dpFixed : Math.round(price * dpPct / 100);
    const maintenanceFees = Math.round(price * maintenance / 100);
    const deliveryFees = Math.round(price * delivery / 100);
    const totalExtras = maintenanceFees + deliveryFees;
    const remaining = price - downPayment;
    const totalPayable = remaining + totalExtras;

    const schedule = useMemo(() => buildSchedule(remaining, years, freq), [remaining, years, freq]);

    const freqLabel: Record<Freq, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi: 'نصف سنوي', annual: 'سنوي' };

    const handlePrint = () => {
        const win = window.open('', '_blank');
        if (!win) return;
        const rows = schedule.map(r =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${r.label}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${fmt(r.amount)} ج.م</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right;color:#666">${fmt(Math.max(0, r.remaining))} ج.م</td></tr>`
        ).join('');
        win.document.write(`<html dir="rtl"><head><title>عرض مالي - SIRA</title><style>body{font-family:Arial;margin:32px;color:#0B1828}h1{color:#BF9B30}table{width:100%;border-collapse:collapse}th{background:#0B1828;color:white;padding:8px 12px}td{font-size:13px}.total{background:#f8f9fa;font-weight:bold}</style></head><body>
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #BF9B30;padding-bottom:16px;margin-bottom:24px">
                <div><h1>SIRA CRM — عرض مالي</h1><p style="color:#666;font-size:12px">نظام إدارة العقارات المتكامل</p></div>
                <div style="text-align:left"><p style="font-size:12px;color:#666">${new Date().toLocaleDateString('ar-EG')}</p></div>
            </div>
            ${clientName ? `<p><strong>العميل:</strong> ${clientName}</p>` : ''}
            ${unitLabel ? `<p><strong>الوحدة:</strong> ${unitLabel}</p>` : ''}
            <table style="margin:16px 0;width:100%;border-collapse:collapse">
                <tr class="total"><td style="padding:8px 12px">سعر الوحدة</td><td style="padding:8px 12px;text-align:right">${fmt(price)} ج.م</td></tr>
                <tr><td style="padding:8px 12px">المقدم (${dpFixed !== null ? fmt(downPayment) : dpPct + '%'})</td><td style="padding:8px 12px;text-align:right;color:#16a34a;font-weight:bold">${fmt(downPayment)} ج.م</td></tr>
                <tr><td style="padding:8px 12px">رسوم الصيانة (${maintenance}%)</td><td style="padding:8px 12px;text-align:right">${fmt(maintenanceFees)} ج.م</td></tr>
                ${delivery > 0 ? `<tr><td style="padding:8px 12px">رسوم التسليم (${delivery}%)</td><td style="padding:8px 12px;text-align:right">${fmt(deliveryFees)} ج.م</td></tr>` : ''}
                <tr><td style="padding:8px 12px">المبلغ المتبقي بالتقسيط</td><td style="padding:8px 12px;text-align:right;font-weight:bold">${fmt(remaining)} ج.م</td></tr>
                <tr class="total"><td style="padding:8px 12px">مدة التقسيط</td><td style="padding:8px 12px;text-align:right">${years} سنة — ${freqLabel[freq]}</td></tr>
                <tr class="total"><td style="padding:8px 12px">القسط (${freqLabel[freq]})</td><td style="padding:8px 12px;text-align:right;color:#BF9B30;font-size:16px;font-weight:bold">${fmt(schedule[0]?.amount ?? 0)} ج.م</td></tr>
            </table>
            <h3 style="margin-top:24px">جدول الأقساط</h3>
            <table><thead><tr><th>الفترة</th><th style="text-align:right">القسط</th><th style="text-align:right">المتبقي</th></tr></thead><tbody>${rows}</tbody></table>
            <p style="margin-top:24px;text-align:center;font-size:11px;color:#999">SIRA Real Estate CRM — جميع الحقوق محفوظة</p>
            </body></html>`);
        win.document.close();
        win.print();
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Inputs */}
                <div className="lg:col-span-1 space-y-4 rounded-[2rem] bg-[#0B1828] p-6 text-white">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#BF9B30]">بيانات الوحدة</p>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">اسم العميل</label>
                        <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="مثال: محمد أحمد" className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px] font-bold text-white placeholder:text-slate-500 outline-none focus:border-[#BF9B30]" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">الوحدة / المشروع</label>
                        <input value={unitLabel} onChange={e => setUnitLabel(e.target.value)} placeholder="مثال: شقة 3 غرف - الرحاب" className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px] font-bold text-white placeholder:text-slate-500 outline-none focus:border-[#BF9B30]" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">سعر الوحدة (ج.م)</label>
                        <input type="number" value={price} onChange={e => setPrice(Number(e.target.value))} className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-xl font-black text-[#BF9B30] outline-none focus:border-[#BF9B30]" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">المقدم</label>
                        <div className="flex gap-2">
                            <button onClick={() => setDpFixed(null)} className={cn('flex-1 rounded-xl py-2 text-[10px] font-black transition', dpFixed === null ? 'bg-[#BF9B30] text-white' : 'bg-white/5 text-slate-400')}>نسبة %</button>
                            <button onClick={() => setDpFixed(downPayment)} className={cn('flex-1 rounded-xl py-2 text-[10px] font-black transition', dpFixed !== null ? 'bg-[#BF9B30] text-white' : 'bg-white/5 text-slate-400')}>مبلغ ثابت</button>
                        </div>
                        {dpFixed === null ? (
                            <div className="flex items-center gap-3">
                                <input type="range" min={0} max={50} step={5} value={dpPct} onChange={e => setDpPct(Number(e.target.value))} className="flex-1 accent-[#BF9B30]" />
                                <span className="w-12 text-center font-black text-lg text-[#BF9B30]">{dpPct}%</span>
                            </div>
                        ) : (
                            <input type="number" value={dpFixed} onChange={e => setDpFixed(Number(e.target.value))} className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-lg font-black text-[#BF9B30] outline-none focus:border-[#BF9B30]" />
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">صيانة %</label>
                            <input type="number" min={0} max={20} step={0.5} value={maintenance} onChange={e => setMaintenance(Number(e.target.value))} className="w-full rounded-2xl bg-white/5 border border-white/10 px-3 py-2.5 text-[13px] font-black text-white outline-none focus:border-[#BF9B30]" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">تسليم %</label>
                            <input type="number" min={0} max={20} step={0.5} value={delivery} onChange={e => setDelivery(Number(e.target.value))} className="w-full rounded-2xl bg-white/5 border border-white/10 px-3 py-2.5 text-[13px] font-black text-white outline-none focus:border-[#BF9B30]" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">مدة التقسيط (سنوات)</label>
                        <select value={years} onChange={e => setYears(Number(e.target.value))} className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-[13px] font-black text-white outline-none focus:border-[#BF9B30]">
                            {[1,2,3,4,5,6,7,8,9,10,12,15,20].map(y => <option key={y} value={y} className="text-[#0B1828]">{y} سنة</option>)}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">دورية القسط</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['monthly','quarterly','semi','annual'] as Freq[]).map(f => (
                                <button key={f} onClick={() => setFreq(f)} className={cn('rounded-xl py-2 text-[10px] font-black transition', freq === f ? 'bg-[#BF9B30] text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10')}>
                                    {freqLabel[f]}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Results */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'المقدم', value: downPayment, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Coins },
                            { label: 'قسط ' + freqLabel[freq], value: schedule[0]?.amount ?? 0, color: 'bg-[#BF9B30]/10 text-[#BF9B30] border-[#BF9B30]/30', icon: Calendar },
                            { label: 'رسوم صيانة', value: maintenanceFees, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: TrendingDown },
                            { label: 'إجمالي القسط', value: totalPayable, color: 'bg-[#0B1828]/5 text-[#0B1828] border-[#0B1828]/10', icon: ClipboardList },
                        ].map(({ label, value, color, icon: Icon }) => (
                            <div key={label} className={`rounded-2xl border p-4 ${color}`}>
                                <Icon className="h-4 w-4 mb-2 opacity-70" />
                                <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
                                <p className="text-lg font-black tabular-nums">{fmt(value)}</p>
                                <p className="text-[9px] font-bold opacity-60">ج.م</p>
                            </div>
                        ))}
                    </div>

                    {/* Full breakdown */}
                    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">ملخص مالي كامل</p>
                        {[
                            { label: 'سعر الوحدة', value: price, bold: false },
                            { label: `المقدم (${dpFixed !== null ? fmt(downPayment) + ' ج.م' : dpPct + '%'})`, value: downPayment, bold: false, green: true },
                            { label: `رسوم الصيانة (${maintenance}%)`, value: maintenanceFees, bold: false },
                            ...(delivery > 0 ? [{ label: `رسوم التسليم (${delivery}%)`, value: deliveryFees, bold: false }] : []),
                            { label: 'المبلغ المتبقي بالتقسيط', value: remaining, bold: true },
                            { label: `مدة التقسيط — ${years} سنة`, value: 0, bold: false, meta: true },
                        ].map(({ label, value, bold, green, meta }) => meta ? (
                            <div key={label} className="flex justify-between items-center py-2 border-t border-slate-100">
                                <span className="text-[12px] font-black text-slate-500">{label}</span>
                                <span className="text-[12px] font-black text-slate-400">{freqLabel[freq]} × {schedule.length} دفعة</span>
                            </div>
                        ) : (
                            <div key={label} className={`flex justify-between items-center py-2 ${bold ? 'border-t-2 border-[#0B1828] mt-1' : 'border-t border-slate-100'}`}>
                                <span className={`text-[12px] font-black ${bold ? 'text-[#0B1828]' : 'text-slate-600'}`}>{label}</span>
                                <span className={`text-[13px] font-black tabular-nums ${green ? 'text-emerald-600' : bold ? 'text-[#BF9B30] text-base' : 'text-[#0B1828]'}`}>{fmt(value)} ج.م</span>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button onClick={() => setShowTable(v => !v)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-[11px] font-black text-[#0B1828] hover:bg-slate-50 transition-all">
                            {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            {showTable ? 'إخفاء' : 'عرض'} جدول الأقساط ({schedule.length} دفعة)
                        </button>
                        <button onClick={handlePrint} className="flex items-center gap-2 rounded-2xl bg-[#0B1828] px-5 py-3 text-[11px] font-black text-white hover:bg-[#16263a] transition-all">
                            <Printer className="h-4 w-4" /> طباعة العرض
                        </button>
                    </div>

                    {/* Installment table */}
                    {showTable && (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <table className="w-full text-right text-[12px]">
                                <thead>
                                    <tr className="bg-[#0B1828] text-white">
                                        <th className="px-4 py-3 font-black">#</th>
                                        <th className="px-4 py-3 font-black">الفترة</th>
                                        <th className="px-4 py-3 font-black">القسط</th>
                                        <th className="px-4 py-3 font-black">المتبقي</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {schedule.map((row, i) => (
                                        <tr key={row.period} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                            <td className="px-4 py-2.5 text-slate-400 font-bold">{row.period}</td>
                                            <td className="px-4 py-2.5 font-bold text-[#0B1828]">{row.label}</td>
                                            <td className="px-4 py-2.5 font-black text-[#BF9B30] tabular-nums">{fmt(row.amount)} ج.م</td>
                                            <td className="px-4 py-2.5 font-bold text-slate-500 tabular-nums">{fmt(Math.max(0, row.remaining))} ج.م</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-[#0B1828]/5 font-black border-t-2 border-[#0B1828]">
                                        <td colSpan={2} className="px-4 py-3 text-[#0B1828]">الإجمالي</td>
                                        <td className="px-4 py-3 text-[#BF9B30] tabular-nums">{fmt(remaining)} ج.م</td>
                                        <td className="px-4 py-3 text-emerald-600">✓ مكتمل</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Projects Tab ──────────────────────────────────────────
function ProjectsTab() {
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const { data: unitsData } = useQuery({
        queryKey: ['units-assistant'],
        queryFn: () => getUnits(),
        staleTime: 60_000,
    });

    const units: any[] = Array.isArray(unitsData) ? unitsData : [];

    const filtered = units.filter(u => {
        const q = search.toLowerCase();
        const match = !q || [u.projectName, u.location, u.description, u.ownerName, u.code]
            .some(v => v?.toLowerCase().includes(q));
        const type = !typeFilter || u.unitType === typeFilter;
        return match && type;
    });

    const types = [...new Set(units.map((u: any) => u.unitType).filter(Boolean))];

    return (
        <div className="space-y-5" dir="rtl">
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute top-1/2 -translate-y-1/2 end-4 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالمشروع، الموقع، المطور..." className="w-full rounded-2xl border border-slate-200 bg-white pe-10 ps-4 py-3 text-[13px] font-bold text-[#0B1828] outline-none focus:border-[#BF9B30]" />
                </div>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-black text-[#0B1828] outline-none focus:border-[#BF9B30]">
                    <option value="">كل الأنواع</option>
                    {types.map(t => <option key={String(t)} value={String(t)}>{String(t)}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-slate-400 text-sm font-bold">لا توجد وحدات مطابقة</div>
                ) : filtered.map((u: any) => (
                    <div key={u.id} className="rounded-[1.75rem] border border-slate-100 bg-white p-5 hover:border-[#BF9B30]/40 hover:shadow-md transition-all space-y-3">
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#BF9B30]">{u.unitType || 'وحدة'}</p>
                                <p className="text-[15px] font-black text-[#0B1828] leading-tight">{u.projectName || u.code}</p>
                            </div>
                            <span className={cn('shrink-0 rounded-full px-3 py-1 text-[9px] font-black uppercase', u.status === 'available' ? 'bg-emerald-50 text-emerald-700' : u.status === 'reserved' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700')}>
                                {u.status === 'available' ? 'متاحة' : u.status === 'reserved' ? 'محجوزة' : 'مباعة'}
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            {u.location && <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />{u.location}</div>}
                            {u.ownerName && <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />{u.ownerName}</div>}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {u.bedrooms != null && <div className="rounded-xl bg-slate-50 px-2 py-1.5 text-center"><BedDouble className="h-3.5 w-3.5 mx-auto text-slate-400 mb-0.5" /><p className="text-[11px] font-black text-[#0B1828]">{u.bedrooms} غرف</p></div>}
                            {u.area != null && <div className="rounded-xl bg-slate-50 px-2 py-1.5 text-center"><Square className="h-3.5 w-3.5 mx-auto text-slate-400 mb-0.5" /><p className="text-[11px] font-black text-[#0B1828]">{u.area} م²</p></div>}
                            {u.floor != null && <div className="rounded-xl bg-slate-50 px-2 py-1.5 text-center"><Home className="h-3.5 w-3.5 mx-auto text-slate-400 mb-0.5" /><p className="text-[11px] font-black text-[#0B1828]">دور {u.floor}</p></div>}
                        </div>

                        {u.price && (
                            <div className="rounded-2xl bg-[#BF9B30]/10 border border-[#BF9B30]/20 px-4 py-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-[#BF9B30]">السعر الإجمالي</p>
                                <p className="text-lg font-black text-[#0B1828] tabular-nums">{fmt(u.price)} <span className="text-[11px] text-slate-400">ج.م</span></p>
                                {u.monthlyInstallment && <p className="text-[11px] font-bold text-slate-500">قسط شهري: {fmt(u.monthlyInstallment)} ج.م</p>}
                            </div>
                        )}

                        {u.description && <p className="text-[11px] font-bold text-slate-400 line-clamp-2">{u.description}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Offer Tab ─────────────────────────────────────────────
function OfferTab() {
    const [client, setClient] = useState({ name: '', phone: '', email: '' });
    const [unit, setUnit] = useState({ name: '', location: '', price: 0, developer: '', type: '' });
    const [plan, setPlan] = useState({ dp: 20, years: 7, freq: 'quarterly' as Freq, maintenance: 8 });

    const downPayment = Math.round(unit.price * plan.dp / 100);
    const remaining = unit.price - downPayment;
    const maint = Math.round(unit.price * plan.maintenance / 100);
    const freq: Record<Freq, number> = { monthly: 12, quarterly: 4, semi: 2, annual: 1 };
    const periods = plan.years * freq[plan.freq];
    const installment = periods > 0 ? Math.round(remaining / periods) : 0;
    const freqLabel: Record<Freq, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi: 'نصف سنوي', annual: 'سنوي' };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Client info */}
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <User className="h-4 w-4 text-[#BF9B30]" />
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">بيانات العميل</p>
                    </div>
                    {[
                        { label: 'اسم العميل', key: 'name', icon: User, placeholder: 'الاسم الكامل' },
                        { label: 'رقم الهاتف', key: 'phone', icon: Phone, placeholder: '010xxxxxxxx' },
                        { label: 'البريد الإلكتروني', key: 'email', icon: FileText, placeholder: 'example@mail.com' },
                    ].map(({ label, key, icon: Icon, placeholder }) => (
                        <div key={key} className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><Icon className="h-3 w-3" />{label}</label>
                            <input value={(client as any)[key]} onChange={e => setClient(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-bold text-[#0B1828] outline-none focus:border-[#BF9B30] focus:bg-white transition-all" />
                        </div>
                    ))}
                </div>

                {/* Unit info */}
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-[#BF9B30]" />
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">بيانات الوحدة</p>
                    </div>
                    {[
                        { label: 'اسم المشروع', key: 'name', placeholder: 'مثال: كمبوند الرحاب' },
                        { label: 'الموقع', key: 'location', placeholder: 'مثال: التجمع الخامس' },
                        { label: 'المطور العقاري', key: 'developer', placeholder: 'مثال: شركة مدينة نصر' },
                        { label: 'نوع الوحدة', key: 'type', placeholder: 'مثال: شقة 3 غرف — 175 م²' },
                    ].map(({ label, key, placeholder }) => (
                        <div key={key} className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
                            <input value={(unit as any)[key]} onChange={e => setUnit(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] font-bold text-[#0B1828] outline-none focus:border-[#BF9B30] focus:bg-white transition-all" />
                        </div>
                    ))}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">السعر الإجمالي (ج.م)</label>
                        <input type="number" value={unit.price || ''} onChange={e => setUnit(p => ({ ...p, price: Number(e.target.value) }))} placeholder="0" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] font-black text-[#BF9B30] outline-none focus:border-[#BF9B30] focus:bg-white transition-all" />
                    </div>
                </div>
            </div>

            {/* Payment plan */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Calendar className="h-4 w-4 text-[#BF9B30]" />
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">خطة السداد</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">مقدم %</label>
                        <div className="flex items-center gap-2">
                            <input type="range" min={0} max={50} step={5} value={plan.dp} onChange={e => setPlan(p => ({ ...p, dp: Number(e.target.value) }))} className="flex-1 accent-[#BF9B30]" />
                            <span className="font-black text-[#BF9B30] text-sm">{plan.dp}%</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">سنوات</label>
                        <select value={plan.years} onChange={e => setPlan(p => ({ ...p, years: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-black text-[#0B1828] outline-none">
                            {[1,2,3,4,5,6,7,8,9,10,12,15].map(y => <option key={y} value={y}>{y} سنة</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">دورية</label>
                        <select value={plan.freq} onChange={e => setPlan(p => ({ ...p, freq: e.target.value as Freq }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-black text-[#0B1828] outline-none">
                            {(['monthly','quarterly','semi','annual'] as Freq[]).map(f => <option key={f} value={f}>{freqLabel[f]}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">صيانة %</label>
                        <input type="number" min={0} max={15} step={0.5} value={plan.maintenance} onChange={e => setPlan(p => ({ ...p, maintenance: Number(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-black text-[#0B1828] outline-none" />
                    </div>
                </div>
            </div>

            {/* Offer preview */}
            {unit.price > 0 && (
                <div className="rounded-[2rem] border-2 border-[#BF9B30]/40 bg-gradient-to-br from-[#0B1828] to-[#16263a] p-6 text-white space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#BF9B30]">ملخص العرض المالي</p>
                        <button
                            onClick={() => {
                                const win = window.open('', '_blank');
                                if (!win) return;
                                win.document.write(`<html dir="rtl"><head><title>عرض مالي - SIRA</title><style>body{font-family:Arial;margin:32px;color:#0B1828}h2{color:#BF9B30}table{width:100%;border-collapse:collapse}th{background:#0B1828;color:#fff;padding:8px 12px}td{padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}.gold{color:#BF9B30;font-weight:900}</style></head><body>
                                <div style="display:flex;justify-content:space-between;border-bottom:3px solid #BF9B30;padding-bottom:16px;margin-bottom:24px">
                                <h2>SIRA CRM — عرض مالي</h2><span style="font-size:12px;color:#666">${new Date().toLocaleDateString('ar-EG')}</span></div>
                                ${client.name ? `<p><strong>العميل:</strong> ${client.name}</p>` : ''}
                                ${client.phone ? `<p><strong>الهاتف:</strong> ${client.phone}</p>` : ''}
                                ${unit.name ? `<p><strong>المشروع:</strong> ${unit.name}${unit.location ? ' — ' + unit.location : ''}</p>` : ''}
                                ${unit.developer ? `<p><strong>المطور:</strong> ${unit.developer}</p>` : ''}
                                <table style="margin-top:16px"><thead><tr><th>البيان</th><th style="text-align:right">القيمة</th></tr></thead><tbody>
                                <tr><td>سعر الوحدة</td><td style="text-align:right">${fmt(unit.price)} ج.م</td></tr>
                                <tr><td>المقدم (${plan.dp}%)</td><td class="gold" style="text-align:right">${fmt(downPayment)} ج.م</td></tr>
                                <tr><td>رسوم الصيانة (${plan.maintenance}%)</td><td style="text-align:right">${fmt(maint)} ج.م</td></tr>
                                <tr><td>المبلغ المتبقي بالتقسيط</td><td style="text-align:right;font-weight:bold">${fmt(remaining)} ج.م</td></tr>
                                <tr><td>مدة التقسيط</td><td style="text-align:right">${plan.years} سنة — ${periods} دفعة ${freqLabel[plan.freq]}</td></tr>
                                <tr><td>القسط (${freqLabel[plan.freq]})</td><td class="gold" style="text-align:right;font-size:16px">${fmt(installment)} ج.م</td></tr>
                                </tbody></table>
                                <p style="margin-top:32px;text-align:center;font-size:11px;color:#999">SIRA Real Estate CRM</p>
                                </body></html>`);
                                win.document.close(); win.print();
                            }}
                            className="flex items-center gap-2 rounded-2xl bg-[#BF9B30] px-4 py-2 text-[11px] font-black text-white hover:bg-[#a8872a] transition-all"
                        >
                            <Printer className="h-3.5 w-3.5" /> طباعة
                        </button>
                    </div>
                    {client.name && <p className="text-lg font-black">العميل: <span className="text-[#BF9B30]">{client.name}</span></p>}
                    {unit.name && <p className="text-[13px] font-bold text-slate-300">{unit.name} — {unit.location}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                        {[
                            { label: 'سعر الوحدة', value: fmt(unit.price) + ' ج.م' },
                            { label: 'المقدم ' + plan.dp + '%', value: fmt(downPayment) + ' ج.م', gold: true },
                            { label: 'القسط ' + freqLabel[plan.freq], value: fmt(installment) + ' ج.م', gold: true },
                            { label: 'رسوم الصيانة', value: fmt(maint) + ' ج.م' },
                        ].map(({ label, value, gold }) => (
                            <div key={label} className="rounded-2xl bg-white/5 p-3 border border-white/10">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                                <p className={`text-[14px] font-black tabular-nums ${gold ? 'text-[#BF9B30]' : 'text-white'}`}>{value}</p>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{plan.years} سنة — {periods} دفعة {freqLabel[plan.freq]}</p>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────
export default function SalesAssistant() {
    const [tab, setTab] = useState<Tab>('calc');

    const tabs: { id: Tab; label: string; icon: any; desc: string }[] = [
        { id: 'calc', label: 'الحاسبة المتقدمة', icon: Calculator, desc: 'أقساط + جدول كامل + طباعة' },
        { id: 'projects', label: 'دليل المشاريع', icon: Building2, desc: 'كل الوحدات والمطورين' },
        { id: 'offer', label: 'إنشاء عرض', icon: FileText, desc: 'عرض مالي كامل للعميل' },
    ];

    return (
        <div className="space-y-6 pb-10 p-4 md:p-6" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#BF9B30] text-white shadow-lg shadow-[#BF9B30]/30">
                    <Calculator className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">أدوات المبيعات</p>
                    <h1 className="text-2xl font-black text-[#0B1828] dark:text-foreground">مساعد المبيعات</h1>
                </div>
            </div>

            {/* Tabs */}
            <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                {tabs.map(({ id, label, icon: Icon, desc }) => (
                    <button key={id} onClick={() => setTab(id)} className={cn(
                        'shrink-0 flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-start transition-all',
                        tab === id
                            ? 'border-[#BF9B30] bg-[#0B1828] text-white shadow-lg'
                            : 'border-slate-200 bg-white text-[#0B1828] hover:border-[#BF9B30]/40'
                    )}>
                        <Icon className={cn('h-5 w-5 shrink-0', tab === id ? 'text-[#BF9B30]' : 'text-slate-400')} />
                        <div>
                            <p className="text-[12px] font-black">{label}</p>
                            <p className={cn('text-[10px] font-bold', tab === id ? 'text-slate-400' : 'text-slate-400')}>{desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === 'calc' && <CalcTab />}
            {tab === 'projects' && <ProjectsTab />}
            {tab === 'offer' && <OfferTab />}
        </div>
    );
}
