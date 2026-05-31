import { useEffect, useState, useMemo } from 'react';
import { MessageCircle, Search, CheckSquare, Square, Send, Users, Phone, Loader2 } from 'lucide-react';
import { getAllLeads } from '../services/api';
import WhatsAppBroadcastModal from '../components/leads/WhatsAppBroadcastModal';
import { cn } from '../lib/utils';

type Lead = { id: number; firstName?: string | null; lastName?: string | null; phone?: string | null; status?: string | null };

export default function WhatsAppBroadcastPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [broadcastOpen, setBroadcastOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const PAGE_SIZE = 50;

    const loadLeads = async (p: number) => {
        setLoading(true);
        try {
            const res = await getAllLeads(p, PAGE_SIZE, {
                assigneePresence: 'assigned',
                ...(search.trim() ? { search: search.trim() } : {}),
            });
            const rows: Lead[] = res.data ?? res.leads ?? res ?? [];
            setLeads(rows);
            const meta = res.meta ?? res.pagination;
            setTotalPages(meta?.totalPages ?? meta?.lastPage ?? 1);
        } catch {
            setLeads([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => { setPage(1); loadLeads(1); }, 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => { loadLeads(page); }, [page]);

    const name = (l: Lead) => `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || `Lead ${l.id}`;

    const filtered = useMemo(() =>
        leads.filter((l) => {
            if (!search.trim()) return true;
            const q = search.toLowerCase();
            return name(l).toLowerCase().includes(q) || (l.phone ?? '').includes(q);
        }),
        [leads, search],
    );

    const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id));

    const toggleAll = () => {
        if (allSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                filtered.forEach((l) => next.delete(l.id));
                return next;
            });
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev);
                filtered.forEach((l) => next.add(l.id));
                return next;
            });
        }
    };

    const toggleOne = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

    return (
        <div className="space-y-5 max-w-3xl" dir="rtl">
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/30">
                    <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">بوابة واتساب</p>
                    <h1 className="text-2xl font-black text-[#0B1828] dark:text-foreground">إرسال واتساب جماعي</h1>
                </div>
            </div>

            {/* Search & select all */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث بالاسم أو الرقم…"
                        className="w-full rounded-2xl border border-slate-200 bg-white pe-10 ps-4 py-3 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/30 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground"
                    />
                </div>
                <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] font-black text-[#0B1828] transition hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground"
                >
                    {allSelected
                        ? <CheckSquare className="h-4 w-4 text-[#16a34a]" />
                        : <Square className="h-4 w-4 text-slate-400" />}
                    تحديد الكل
                </button>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-[12px] font-bold text-slate-500">
                <Users className="h-4 w-4" />
                <span>{filtered.length} عميل</span>
                {selectedIds.size > 0 && (
                    <span className="rounded-full bg-[#16a34a]/10 px-3 py-0.5 text-[#16a34a] font-black">
                        {selectedIds.size} محدد
                    </span>
                )}
            </div>

            {/* Lead list */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-sira-border dark:bg-sira-bg-card">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-[13px] font-bold">جاري التحميل…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                        <Users className="h-8 w-8" />
                        <p className="text-[13px] font-bold">لا يوجد عملاء</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-sira-border/40">
                        {filtered.map((lead) => {
                            const selected = selectedIds.has(lead.id);
                            return (
                                <button
                                    key={lead.id}
                                    type="button"
                                    onClick={() => toggleOne(lead.id)}
                                    className={cn(
                                        'w-full flex items-center gap-4 px-5 py-4 text-start transition-colors',
                                        selected ? 'bg-[#16a34a]/5' : 'hover:bg-slate-50 dark:hover:bg-foreground/5',
                                    )}
                                >
                                    {selected
                                        ? <CheckSquare className="h-5 w-5 shrink-0 text-[#16a34a]" />
                                        : <Square className="h-5 w-5 shrink-0 text-slate-300" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-black text-[#0B1828] dark:text-foreground truncate">{name(lead)}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                                            <p className="text-[11px] font-bold text-slate-400 truncate" dir="ltr">
                                                {lead.phone?.trim() || <span className="text-red-400">لا يوجد رقم</span>}
                                            </p>
                                        </div>
                                    </div>
                                    {!lead.phone?.trim() && (
                                        <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-500">لا رقم</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                    <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-black text-[#0B1828] disabled:opacity-40 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground"
                    >
                        السابق
                    </button>
                    <span className="text-[12px] font-bold text-slate-500">{page} / {totalPages}</span>
                    <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-black text-[#0B1828] disabled:opacity-40 hover:bg-slate-50 dark:border-sira-border dark:bg-sira-bg-card dark:text-foreground"
                    >
                        التالي
                    </button>
                </div>
            )}

            {/* Floating send bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 inset-x-0 flex justify-center z-50 px-4 pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-4 rounded-[2rem] border border-slate-200 bg-white px-6 py-4 shadow-[0_20px_50px_rgba(11,24,40,0.18)]">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#16a34a]/10 text-[#16a34a] text-[16px] font-black">
                            {selectedIds.size}
                        </div>
                        <p className="text-[13px] font-black text-[#0B1828]">عميل محدد</p>
                        <button
                            type="button"
                            onClick={() => setBroadcastOpen(true)}
                            className="flex items-center gap-2 rounded-2xl bg-[#16a34a] px-6 py-3 text-[13px] font-black text-white shadow-md transition hover:bg-[#15803d]"
                        >
                            <Send className="h-4 w-4" />
                            إرسال واتساب
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedIds(new Set())}
                            className="text-[12px] font-bold text-slate-400 hover:text-slate-600"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            )}

            {broadcastOpen && (
                <WhatsAppBroadcastModal
                    leads={selectedLeads}
                    onClose={() => { setBroadcastOpen(false); setSelectedIds(new Set()); }}
                />
            )}
        </div>
    );
}
