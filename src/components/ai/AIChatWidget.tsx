import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Sparkles, Settings, Trash2, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────
interface Message { role: 'user' | 'assistant'; content: string; ts: number; }

// ─── System prompt ────────────────────────────────────────
const SYSTEM_PROMPT = `أنت مساعد مبيعات عقاري خبير متخصص في السوق المصري، تعمل ضمن نظام SIRA CRM.

مهامك:
- مساعدة فريق المبيعات في إدارة العملاء (Leads) والتفاوض وإغلاق الصفقات
- تقديم نصائح واستراتيجيات بيع العقارات في مصر (التجمع، الشيخ زايد، أكتوبر، المعادي، الإسكندرية...)
- شرح أنواع الوحدات (شقق، فيلل، دوبلكس، تاون هاوس) ومميزاتها
- مساعدة في حساب خطط الأقساط والمقدم
- تقديم تقنيات للتعامل مع اعتراضات العملاء
- نصائح لمتابعة العملاء الباردين وتحويلهم لـ hot leads
- معلومات عن المطورين الكبار (بالم هيلز، ماونتن فيو، إعمار، سوديك، أوراسكوم...)
- تحليل السوق العقاري المصري

قواعد:
- رد باللغة التي يكتب بها المستخدم (عربي أو إنجليزي)
- كن مختصراً وعملياً ومباشراً
- قدم أمثلة واقعية من السوق المصري
- لا تختلق أرقاماً أو أسعاراً محددة إلا لو سألك المستخدم عن حسابات تقريبية`;

// ─── Groq API call ────────────────────────────────────────
async function callGroq(messages: Message[], apiKey: string): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...messages.map(m => ({ role: m.role, content: m.content })),
            ],
            max_tokens: 1024,
            temperature: 0.7,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? 'لم أستطع الحصول على رد.';
}

// ─── Suggested prompts ────────────────────────────────────
const SUGGESTIONS = [
    'كيف أتعامل مع عميل قال "مش وقته دلوقتي"؟',
    'ما الفرق بين تاون هاوس ودوبلكس؟',
    'نصائح لإقناع عميل بالمقدم العالي',
    'كيف أحسب القسط الربع سنوي لوحدة بـ 3 مليون؟',
    'أفضل مناطق الاستثمار في القاهرة الجديدة',
    'كيف أرد على "الأسعار غالية"؟',
];

// ─── Storage helpers ──────────────────────────────────────
const STORAGE_KEY = 'sira_ai_chat';
const API_KEY_STORAGE = 'sira_groq_api_key';
function loadHistory(): Message[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(msgs: Message[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
}

// ─── Main component ───────────────────────────────────────
export default function AIChatWidget() {
    const [open, setOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
    const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem(API_KEY_STORAGE) ?? '');
    const [messages, setMessages] = useState<Message[]>(loadHistory);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => { saveHistory(messages); }, [messages]);
    useEffect(() => { if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }, [messages, open]);
    useEffect(() => { if (open && apiKey) inputRef.current?.focus(); }, [open, apiKey]);

    const saveKey = () => {
        const k = apiKeyInput.trim();
        localStorage.setItem(API_KEY_STORAGE, k);
        setApiKey(k);
        setShowSettings(false);
        setError('');
    };

    const send = async (text?: string) => {
        const content = (text ?? input).trim();
        if (!content || loading) return;
        if (!apiKey) { setShowSettings(true); return; }

        const userMsg: Message = { role: 'user', content, ts: Date.now() };
        const next = [...messages, userMsg];
        setMessages(next);
        setInput('');
        setLoading(true);
        setError('');

        try {
            const reply = await callGroq(next, apiKey);
            setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
        } catch (e: any) {
            setError(e.message ?? 'حدث خطأ');
        } finally {
            setLoading(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };

    const hasKey = !!apiKey;

    return (
        <>
            {/* Floating button */}
            <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setOpen(v => !v)}
                className={cn(
                    'fixed bottom-6 start-6 z-[200] flex h-14 w-14 items-center justify-center rounded-2xl shadow-2xl transition-all',
                    open ? 'bg-slate-700 text-white' : 'bg-gradient-to-br from-[#BF9B30] to-[#a07d20] text-white shadow-[#BF9B30]/40',
                )}
                title="مساعد AI"
            >
                {open ? <ChevronDown className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
                {!open && !hasKey && (
                    <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white">!</span>
                )}
            </motion.button>

            {/* Chat panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-24 start-6 z-[200] flex w-[min(92vw,380px)] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/20"
                        dir="rtl"
                        style={{ maxHeight: 'calc(100vh - 120px)' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between bg-[#0B1828] px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#BF9B30]">
                                    <Sparkles className="h-4 w-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-black text-white">مساعد AI للعقارات</p>
                                    <p className="text-[9px] font-bold text-slate-400">مدعوم بـ Llama 3 · Groq</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setShowSettings(v => !v)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors" title="الإعدادات">
                                    <Settings className="h-4 w-4" />
                                </button>
                                <button onClick={() => { setMessages([]); setError(''); }} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors" title="مسح المحادثة">
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Settings panel */}
                        <AnimatePresence>
                            {showSettings && (
                                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-b border-slate-100 bg-slate-50">
                                    <div className="p-4 space-y-3">
                                        <p className="text-[11px] font-black text-[#0B1828]">Groq API Key (مجاني)</p>
                                        <p className="text-[10px] text-slate-500">احصل على مفتاح مجاني من <span className="font-bold text-[#BF9B30]">console.groq.com</span></p>
                                        <input
                                            type="password"
                                            value={apiKeyInput}
                                            onChange={e => setApiKeyInput(e.target.value)}
                                            placeholder="gsk_..."
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-mono text-[#0B1828] outline-none focus:border-[#BF9B30]"
                                        />
                                        <button onClick={saveKey} disabled={!apiKeyInput.trim()} className="w-full rounded-xl bg-[#0B1828] py-2.5 text-[11px] font-black text-white disabled:opacity-40">
                                            حفظ المفتاح
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* No key message */}
                        {!hasKey && !showSettings && (
                            <div className="flex flex-col items-center gap-3 p-6 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#BF9B30]/10">
                                    <Bot className="h-7 w-7 text-[#BF9B30]" />
                                </div>
                                <p className="text-[13px] font-black text-[#0B1828]">ابدأ مع مساعد AI</p>
                                <p className="text-[11px] text-slate-500 leading-relaxed">أدخل مفتاح Groq المجاني للبدء. الذكاء الاصطناعي بيفهم عربي وهيساعدك في كل حاجة تخص العقارات.</p>
                                <button onClick={() => setShowSettings(true)} className="rounded-xl bg-[#BF9B30] px-5 py-2.5 text-[11px] font-black text-white">
                                    إضافة API Key مجاني
                                </button>
                            </div>
                        )}

                        {/* Messages */}
                        {hasKey && (
                            <div className="flex-1 overflow-y-auto space-y-3 p-4" style={{ minHeight: 200 }}>
                                {messages.length === 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-2.5">
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#BF9B30]">
                                                <Bot className="h-4 w-4 text-white" />
                                            </div>
                                            <div className="rounded-2xl rounded-tr-sm bg-slate-100 px-3.5 py-2.5 text-[12px] font-bold text-[#0B1828] max-w-[85%]">
                                                أهلاً! أنا مساعدك في مبيعات العقارات 🏠 ممكن أساعدك في إدارة العملاء، التفاوض، حساب الأقساط، وأي حاجة تانية. اسأل براحتك!
                                            </div>
                                        </div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 text-center">أو اختر سؤال سريع</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {SUGGESTIONS.map(s => (
                                                <button key={s} onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B1828] hover:border-[#BF9B30] hover:bg-[#BF9B30]/5 transition-all text-start">
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {messages.map((m, i) => (
                                    <div key={i} className={cn('flex gap-2.5', m.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                                        {m.role === 'assistant' && (
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#BF9B30]">
                                                <Bot className="h-4 w-4 text-white" />
                                            </div>
                                        )}
                                        <div className={cn(
                                            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[12px] font-bold leading-relaxed whitespace-pre-wrap',
                                            m.role === 'user'
                                                ? 'rounded-tl-sm bg-[#0B1828] text-white'
                                                : 'rounded-tr-sm bg-slate-100 text-[#0B1828]',
                                        )}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))}

                                {loading && (
                                    <div className="flex gap-2.5">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#BF9B30]">
                                            <Bot className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="flex items-center gap-1.5 rounded-2xl rounded-tr-sm bg-slate-100 px-3.5 py-3">
                                            {[0, 1, 2].map(i => (
                                                <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600">
                                        ⚠️ {error.includes('401') ? 'API Key غلط أو منتهي الصلاحية' : error.includes('429') ? 'تجاوزت الحد المسموح — انتظر قليلاً' : error}
                                    </div>
                                )}

                                <div ref={bottomRef} />
                            </div>
                        )}

                        {/* Input */}
                        {hasKey && (
                            <div className="border-t border-slate-100 p-3">
                                <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-[#BF9B30] transition-colors">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onKeyDown={handleKey}
                                        placeholder="اسأل أي سؤال عن العقارات..."
                                        rows={1}
                                        disabled={loading}
                                        className="flex-1 resize-none bg-transparent text-[12px] font-bold text-[#0B1828] placeholder:text-slate-400 outline-none max-h-24 min-h-[24px]"
                                        style={{ height: 'auto' }}
                                        onInput={e => {
                                            const el = e.currentTarget;
                                            el.style.height = 'auto';
                                            el.style.height = el.scrollHeight + 'px';
                                        }}
                                    />
                                    <button
                                        onClick={() => send()}
                                        disabled={!input.trim() || loading}
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#BF9B30] text-white disabled:opacity-40 transition-all hover:bg-[#a07d20]"
                                    >
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </button>
                                </div>
                                <p className="mt-1.5 text-center text-[9px] font-bold text-slate-300">Enter للإرسال · Shift+Enter للسطر الجديد</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
