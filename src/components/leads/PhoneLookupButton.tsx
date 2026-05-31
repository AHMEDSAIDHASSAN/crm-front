import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, X, Phone, CheckCircle2, Signal, ExternalLink } from 'lucide-react';
import { formatPhoneWithCountryCode, getPhoneDigits } from '../../utils/phone';
import { cn } from '../../lib/utils';
import { getPhoneInfo } from '../../services/api';

interface Props {
    phone?: string | null;
    size?: number;
    className?: string;
}

type PhoneData = Awaited<ReturnType<typeof getPhoneInfo>>;

function Popup({ phone, anchorRect, onClose }: { phone: string; anchorRect: DOMRect; onClose: () => void }) {
    const [data, setData] = useState<PhoneData | null>(null);
    const [loading, setLoading] = useState(true);
    const popupRef = useRef<HTMLDivElement>(null);

    const POPUP_W = 340;
    const POPUP_H = 480;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let left = anchorRect.right - POPUP_W;
    if (left < 8) left = 8;
    if (left + POPUP_W > viewportW - 8) left = viewportW - POPUP_W - 8;

    const top = viewportH - anchorRect.bottom >= POPUP_H + 8
        ? anchorRect.bottom + 6
        : Math.max(8, anchorRect.top - POPUP_H - 6);

    const formatted = formatPhoneWithCountryCode(phone);
    const digits = getPhoneDigits(phone);
    const localDigits = digits.replace(/^20/, '0');

    useEffect(() => {
        setLoading(true);
        getPhoneInfo(phone).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
    }, [phone]);

    useEffect(() => {
        const handle = (e: MouseEvent) => { if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose(); };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', handle);
        document.addEventListener('keydown', handleKey);
        return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handleKey); };
    }, [onClose]);

    const externalServices = [
        {
            name: 'GetContact',
            desc: 'بيعرض الأسماء المحفوظة في موبايلات الناس',
            url: `https://www.getcontact.com/search/${encodeURIComponent(formatted)}`,
            bg: 'from-[#7B61FF] to-[#5E3FBE]',
            textColor: 'text-white',
            logo: (
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white font-black text-[11px]">GC</div>
            ),
        },
        {
            name: 'Truecaller',
            desc: 'كشف هوية المتصل من قاعدة البيانات',
            url: `https://www.truecaller.com/search/eg/${localDigits}`,
            bg: 'from-[#0099FF] to-[#0077CC]',
            textColor: 'text-white',
            logo: (
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white font-black text-[11px]">TC</div>
            ),
        },
        {
            name: 'Google',
            desc: 'بحث عن الرقم على الإنترنت',
            url: `https://www.google.com/search?q=${encodeURIComponent(formatted)}`,
            bg: 'from-slate-700 to-slate-900',
            textColor: 'text-white',
            logo: (
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                </div>
            ),
        },
    ];

    return createPortal(
        <div
            ref={popupRef}
            style={{ position: 'fixed', top, left, width: POPUP_W, zIndex: 9999 }}
            className="rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between bg-sira-bg-subtle px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                        <Phone size={13} />
                    </div>
                    <p className="text-[13px] font-black text-sira-text-primary tabular-nums" dir="ltr">{formatted}</p>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100">
                    <X size={14} />
                </button>
            </div>

            {/* Body */}
            <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">

                {/* System info */}
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
                        <p className="text-[11px] text-sira-text-muted">جارٍ جلب البيانات...</p>
                    </div>
                ) : data ? (
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div className={cn('rounded-xl p-2.5 text-center border', data.valid ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200')}>
                                <CheckCircle2 className={cn('h-3.5 w-3.5 mx-auto mb-1', data.valid ? 'text-emerald-600' : 'text-slate-400')} />
                                <p className="text-[9px] font-black uppercase text-sira-text-muted">الحالة</p>
                                <p className={cn('text-[11px] font-black', data.valid ? 'text-emerald-700' : 'text-slate-500')}>{data.valid ? 'رقم صحيح' : 'غير صحيح'}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 text-center">
                                <Signal className="h-3.5 w-3.5 text-slate-500 mx-auto mb-1" />
                                <p className="text-[9px] font-black uppercase text-sira-text-muted">النوع</p>
                                <p className="text-[11px] font-black text-sira-text-primary">{data.lineType === 'mobile' ? 'موبايل' : 'أرضي'}</p>
                            </div>
                        </div>

                        {data.carrier && (
                            <div className="rounded-xl border p-2.5 flex items-center gap-2.5"
                                style={{ borderColor: data.carrier.color + '40', backgroundColor: data.carrier.color + '0D' }}>
                                <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 font-black text-sm text-white"
                                    style={{ backgroundColor: data.carrier.color }}>
                                    {data.carrier.name[0]}
                                </div>
                                <div>
                                    <p className="text-[9px] font-black uppercase text-sira-text-muted">الشبكة</p>
                                    <p className="text-[12px] font-black" style={{ color: data.carrier.color }}>{data.carrier.nameAr}</p>
                                </div>
                            </div>
                        )}

                        {data.existingCount > 0 && (
                            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2.5">
                                <p className="text-[9px] font-black uppercase text-indigo-600 mb-1.5">موجود في السيستم ({data.existingCount})</p>
                                {data.existingLeads.slice(0, 3).map(l => (
                                    <div key={String(l.id)} className="flex items-center justify-between py-1">
                                        <span className="text-[11px] font-black text-indigo-900">{l.name}</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-bold uppercase">{l.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}

                {/* External services */}
                <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-sira-text-muted">
                        بحث خارجي عن اسم المتصل 👇
                    </p>
                    {externalServices.map(s => (
                        <a
                            key={s.name}
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className={cn('flex items-center gap-3 rounded-xl bg-gradient-to-l p-3 transition-all hover:scale-[1.01] active:scale-[0.99]', s.bg)}
                        >
                            {s.logo}
                            <div className="flex-1 min-w-0">
                                <p className={cn('text-[12px] font-black', s.textColor)}>{s.name}</p>
                                <p className="text-[10px] text-white/70 truncate">{s.desc}</p>
                            </div>
                            <ExternalLink size={13} className="text-white/60 shrink-0" />
                        </a>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function PhoneLookupButton({ phone, size = 14, className }: Props) {
    const [open, setOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const btnRef = useRef<HTMLButtonElement>(null);

    if (!phone) return null;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (open) { setOpen(false); return; }
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect) { setAnchorRect(rect); setOpen(true); }
    };

    return (
        <div className={cn('relative inline-flex', className)}>
            <button
                ref={btnRef}
                type="button"
                onClick={handleClick}
                className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all"
                title="بحث عن معلومات الرقم"
            >
                <Search size={size} />
            </button>
            {open && anchorRect && (
                <Popup phone={phone} anchorRect={anchorRect} onClose={() => setOpen(false)} />
            )}
        </div>
    );
}
