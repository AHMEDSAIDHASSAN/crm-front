import { useEffect, useState } from 'react';
import { MessageCircle, CheckCircle2, XCircle, Eye, EyeOff, Send, RefreshCw, Loader2, ShieldCheck, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { getWhatsappConfig, saveWhatsappConfig, testWhatsappGateway } from '../services/api';
import { toast } from '../lib/toast';
import { cn } from '../lib/utils';

export default function WhatsAppGateway() {
    const [config, setConfig] = useState<{ phoneNumberId: string | null; hasToken: boolean; configured: boolean } | null>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);

    const [phoneNumberId, setPhoneNumberId] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [saving, setSaving] = useState(false);

    const [testPhone, setTestPhone] = useState('');
    const [testMessage, setTestMessage] = useState('مرحباً! هذه رسالة اختبار من نظام SIRA CRM ✅');
    const [testing, setTesting] = useState(false);
    const [lastTestResult, setLastTestResult] = useState<'success' | 'failed' | null>(null);

    const loadConfig = async () => {
        setLoadingConfig(true);
        try {
            const c = await getWhatsappConfig();
            setConfig(c);
            if (c.phoneNumberId) setPhoneNumberId(c.phoneNumberId);
        } catch {
            toast.error('فشل تحميل الإعدادات');
        } finally {
            setLoadingConfig(false);
        }
    };

    useEffect(() => { loadConfig(); }, []);

    const handleSave = async () => {
        if (!phoneNumberId.trim() || !accessToken.trim()) {
            toast.error('أدخل الـ Phone Number ID والـ Access Token');
            return;
        }
        setSaving(true);
        try {
            await saveWhatsappConfig(phoneNumberId.trim(), accessToken.trim());
            toast.success('تم حفظ إعدادات البوابة بنجاح');
            setAccessToken('');
            await loadConfig();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || 'فشل الحفظ');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!testPhone.trim()) { toast.error('أدخل رقم الهاتف للاختبار'); return; }
        if (!config?.configured) { toast.error('اربط البوابة أولاً قبل الاختبار'); return; }
        setTesting(true);
        setLastTestResult(null);
        try {
            const res = await testWhatsappGateway(testPhone.trim(), testMessage.trim() || undefined);
            setLastTestResult(res.success ? 'success' : 'failed');
            if (res.success) toast.success('تم إرسال رسالة الاختبار بنجاح!');
            else toast.error('فشل إرسال الرسالة — تحقق من الإعدادات');
        } catch (err: any) {
            setLastTestResult('failed');
            toast.error(err?.response?.data?.message || 'خطأ في الاختبار');
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl" dir="rtl">
            {/* Page header */}
            <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/30">
                    <MessageCircle className="h-6 w-6" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">إعدادات النظام</p>
                    <h1 className="text-2xl font-black text-[#0B1828] dark:text-foreground">بوابة واتساب</h1>
                </div>
            </div>

            {/* Status card */}
            <div className={cn(
                'rounded-2xl border-2 p-5 flex items-center justify-between gap-4',
                loadingConfig ? 'border-slate-200 bg-slate-50' :
                config?.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50',
            )}>
                <div className="flex items-center gap-3">
                    {loadingConfig ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> :
                     config?.configured
                        ? <Wifi className="h-5 w-5 text-emerald-600" />
                        : <WifiOff className="h-5 w-5 text-amber-600" />}
                    <div>
                        <p className={cn('text-[13px] font-black', config?.configured ? 'text-emerald-800' : 'text-amber-800')}>
                            {loadingConfig ? 'جاري التحقق…' : config?.configured ? 'البوابة متصلة ✓' : 'البوابة غير مربوطة'}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500">
                            {config?.phoneNumberId ? `Phone ID: ${config.phoneNumberId}` : 'لم يتم إدخال بيانات بعد'}
                        </p>
                    </div>
                </div>
                <button onClick={loadConfig} className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                    <RefreshCw className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* How to get credentials */}
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                    <div className="text-[12px] font-bold text-blue-700 space-y-1">
                        <p className="font-black text-[13px]">كيف تحصل على الـ Credentials؟</p>
                        <p>1. اذهب لـ <span className="rounded bg-blue-100 px-1 font-black">developers.facebook.com</span></p>
                        <p>2. افتح تطبيقك ← WhatsApp ← API Setup</p>
                        <p>3. انسخ الـ <span className="font-black">Phone Number ID</span> والـ <span className="font-black">Temporary/Permanent Access Token</span></p>
                    </div>
                </div>
            </div>

            {/* Credentials form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card space-y-5">
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-4 w-4 text-[#0B1828]" />
                    <h2 className="text-[14px] font-black text-[#0B1828] dark:text-foreground">بيانات الاتصال</h2>
                </div>

                <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Phone Number ID
                    </label>
                    <input
                        type="text"
                        value={phoneNumberId}
                        onChange={(e) => setPhoneNumberId(e.target.value)}
                        placeholder="مثال: 123456789012345"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/30 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                        dir="ltr"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                        Access Token {config?.hasToken && <span className="ms-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">محفوظ ✓</span>}
                    </label>
                    <div className="relative">
                        <input
                            type={showToken ? 'text' : 'password'}
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            placeholder={config?.hasToken ? '••••••••••••  (اتركه فارغاً للاحتفاظ بالحالي)' : 'أدخل الـ Access Token'}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pe-12 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/30 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                            dir="ltr"
                        />
                        <button
                            type="button"
                            onClick={() => setShowToken(!showToken)}
                            className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-slate-400">
                        يُحفظ بشكل آمن في قاعدة البيانات — مش في الكود
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving || !phoneNumberId.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1828] py-3.5 text-[13px] font-black text-white shadow-md transition hover:bg-slate-800 disabled:opacity-40"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {saving ? 'جاري الحفظ…' : 'حفظ الإعدادات'}
                </button>
            </div>

            {/* Test connection */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-sira-border dark:bg-sira-bg-card space-y-4">
                <div className="flex items-center gap-2 mb-1">
                    <Send className="h-4 w-4 text-[#16a34a]" />
                    <h2 className="text-[14px] font-black text-[#0B1828] dark:text-foreground">اختبار الاتصال</h2>
                </div>

                <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                        رقم الاختبار (مع كود الدولة)
                    </label>
                    <input
                        type="tel"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="01012345678"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/30 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                        dir="ltr"
                    />
                </div>

                <div>
                    <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                        نص رسالة الاختبار
                    </label>
                    <textarea
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/30 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                    />
                </div>

                {lastTestResult && (
                    <div className={cn(
                        'flex items-center gap-2 rounded-xl px-4 py-3 text-[12px] font-black',
                        lastTestResult === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                    )}>
                        {lastTestResult === 'success'
                            ? <><CheckCircle2 className="h-4 w-4" /> تم الإرسال بنجاح! افحص هاتفك.</>
                            : <><XCircle className="h-4 w-4" /> فشل الإرسال. تحقق من الـ credentials والرقم.</>
                        }
                    </div>
                )}

                <button
                    onClick={handleTest}
                    disabled={testing || !testPhone.trim() || !config?.configured}
                    className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-black text-white shadow-md transition disabled:opacity-40',
                        config?.configured ? 'bg-[#16a34a] hover:bg-[#15803d]' : 'bg-slate-400',
                    )}
                >
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {testing ? 'جاري الإرسال…' : !config?.configured ? 'اربط البوابة أولاً' : 'إرسال رسالة اختبار'}
                </button>
            </div>
        </div>
    );
}
