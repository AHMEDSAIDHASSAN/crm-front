import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X, Send, CheckCircle2, XCircle, Loader2, Clock, AlertTriangle, ImagePlus, Trash2 } from 'lucide-react';
import { sendWhatsappToLead, uploadWhatsappMedia } from '../../services/api';
import { cn } from '../../lib/utils';

type LeadRow = { id: number; firstName?: string | null; lastName?: string | null; phone?: string | null };

type SendResult = { leadId: number; name: string; phone: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'no_phone' };

type Props = {
  leads: LeadRow[];
  onClose: () => void;
};

const MIN_DELAY = 100; // seconds
const MAX_DELAY = 200; // seconds

export default function WhatsAppBroadcastModal({ leads, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedMediaId, setUploadedMediaId] = useState<string | null>(null);
  const [step, setStep] = useState<'compose' | 'sending' | 'done'>('compose');
  const [results, setResults] = useState<SendResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const cancelledRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setUploadedMediaId(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setUploadedMediaId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const leadsWithPhone = leads.filter((l) => l.phone?.trim());
  const leadsNoPhone   = leads.filter((l) => !l.phone?.trim());

  const name = (l: LeadRow) => `${l.firstName ?? ''} ${l.lastName ?? ''}`.trim() || `Lead ${l.id}`;

  const clearCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = null;
  };

  useEffect(() => () => { cancelledRef.current = true; clearCountdown(); }, []);

  const startBroadcast = async () => {
    if ((!message.trim() && !imageFile) || leadsWithPhone.length === 0) return;
    cancelledRef.current = false;

    // Upload image once before starting broadcast
    let mediaId: string | undefined;
    if (imageFile && !uploadedMediaId) {
      setUploadingImage(true);
      try {
        const res = await uploadWhatsappMedia(imageFile);
        if (res.success && res.mediaId) {
          mediaId = res.mediaId;
          setUploadedMediaId(res.mediaId);
        } else {
          setUploadingImage(false);
          return;
        }
      } catch {
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    } else if (uploadedMediaId) {
      mediaId = uploadedMediaId;
    }

    const initial: SendResult[] = [
      ...leadsWithPhone.map((l) => ({ leadId: l.id, name: name(l), phone: l.phone!, status: 'pending' as const })),
      ...leadsNoPhone.map((l) => ({ leadId: l.id, name: name(l), phone: '—', status: 'no_phone' as const })),
    ];
    setResults(initial);
    setStep('sending');
    setCurrentIdx(0);

    for (let i = 0; i < leadsWithPhone.length; i++) {
      if (cancelledRef.current) break;
      const lead = leadsWithPhone[i];

      // Mark as sending
      setResults((prev) => prev.map((r) => r.leadId === lead.id ? { ...r, status: 'sending' } : r));
      setCurrentIdx(i);

      // Replace {name} variable
      const finalMsg = message.replace(/\{name\}/gi, name(lead));

      try {
        const res = await sendWhatsappToLead(lead.id, finalMsg, mediaId);
        setResults((prev) => prev.map((r) => r.leadId === lead.id ? { ...r, status: res.success ? 'sent' : 'failed' } : r));
      } catch {
        setResults((prev) => prev.map((r) => r.leadId === lead.id ? { ...r, status: 'failed' } : r));
      }

      // Delay before next message (skip after last one)
      if (i < leadsWithPhone.length - 1 && !cancelledRef.current) {
        const delay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
        setCountdown(delay);
        await new Promise<void>((resolve) => {
          let secs = delay;
          clearCountdown();
          countdownRef.current = setInterval(() => {
            secs -= 1;
            setCountdown(secs);
            if (secs <= 0 || cancelledRef.current) {
              clearCountdown();
              resolve();
            }
          }, 1000);
        });
      }
    }

    clearCountdown();
    setCountdown(0);
    if (!cancelledRef.current) setStep('done');
  };

  const sentCount   = results.filter((r) => r.status === 'sent').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const progress    = leadsWithPhone.length > 0 ? Math.round(((sentCount + failedCount) / leadsWithPhone.length) * 100) : 0;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && step !== 'sending') onClose(); }}>
      <div className="w-full max-w-lg rounded-[2rem] bg-white shadow-2xl dark:bg-sira-bg-card">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-6 dark:border-sira-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#16a34a] text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-black text-[#0B1828] dark:text-foreground">إرسال واتساب جماعي</h2>
              <p className="text-[11px] font-bold text-slate-400">
                {leadsWithPhone.length} عميل · تأخير {MIN_DELAY}–{MAX_DELAY} ثانية بين كل رسالة
              </p>
            </div>
          </div>
          {step !== 'sending' && (
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Compose step */}
          {step === 'compose' && (
            <>
              {leadsNoPhone.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{leadsNoPhone.length} عميل بدون رقم — سيُتخطى تلقائياً</span>
                </div>
              )}
              {/* Image upload */}
              <div>
                <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                  صورة مرفقة (اختياري)
                </label>
                {!imagePreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-6 text-[12px] font-bold text-slate-400 transition hover:border-[#16a34a]/40 hover:bg-[#16a34a]/5 hover:text-[#16a34a] dark:border-sira-border dark:bg-foreground/5"
                  >
                    <ImagePlus className="h-5 w-5" />
                    اختر صورة (JPG, PNG, WEBP)
                  </button>
                ) : (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-sira-border">
                    <img src={imagePreview} alt="preview" className="w-full max-h-48 object-cover" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-2 end-2 flex h-7 w-7 items-center justify-center rounded-xl bg-red-500 text-white shadow-md"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/40 px-3 py-1.5">
                      <p className="text-[10px] font-bold text-white truncate">{imageFile?.name}</p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageSelect(f); }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                  نص الرسالة {imageFile ? '(سيُرسل كتعليق على الصورة)' : '— استخدم'} {!imageFile && <code className="rounded bg-slate-100 px-1">{'{name}'}</code>} {!imageFile && 'لاسم العميل'}
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder={imageFile ? 'أضف تعليقاً على الصورة (اختياري)...' : `مثال: مرحباً {name}، لدينا عروض حصرية على وحدات القاهرة الجديدة. تواصل معنا الآن!`}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] font-bold text-[#0B1828] outline-none transition focus:border-[#0B1828]/20 focus:bg-white dark:border-sira-border dark:bg-foreground/5 dark:text-foreground"
                />
                <p className="mt-1 text-[10px] font-bold text-slate-400">{message.length} حرف</p>
              </div>

              {/* Preview */}
              {(message.trim() || imageFile) && leadsWithPhone.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-sira-border dark:bg-foreground/5">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">معاينة للعميل الأول</p>
                  {imageFile && imagePreview && (
                    <img src={imagePreview} alt="preview" className="mb-2 w-full max-h-32 object-cover rounded-xl" />
                  )}
                  {message.trim() && (
                    <p className="whitespace-pre-wrap text-[12px] font-bold text-[#0B1828] dark:text-foreground">
                      {message.replace(/\{name\}/gi, name(leadsWithPhone[0]))}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={startBroadcast}
                disabled={(!message.trim() && !imageFile) || leadsWithPhone.length === 0 || uploadingImage}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] py-4 text-[13px] font-black text-white shadow-md transition hover:bg-[#15803d] disabled:opacity-40"
              >
                {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {uploadingImage ? 'جاري رفع الصورة…' : `ابدأ الإرسال لـ ${leadsWithPhone.length} عميل`}
              </button>
            </>
          )}

          {/* Sending step */}
          {(step === 'sending' || step === 'done') && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
                  <span className="text-slate-600 dark:text-slate-300">
                    {step === 'sending' ? `جاري الإرسال… ${sentCount + failedCount}/${leadsWithPhone.length}` : `اكتمل — ${sentCount} نجح · ${failedCount} فشل`}
                  </span>
                  <span className="font-black text-[#0B1828] dark:text-foreground">{progress}%</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#16a34a] transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Countdown */}
              {step === 'sending' && countdown > 0 && (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 py-3 text-[12px] font-black text-amber-700">
                  <Clock className="h-4 w-4 animate-pulse" />
                  الرسالة التالية في {countdown} ثانية
                </div>
              )}

              {/* Results list */}
              <div className="divide-y divide-slate-100 dark:divide-sira-border/40">
                {results.map((r) => (
                  <div key={r.leadId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {r.status === 'pending'  && <div className="h-4 w-4 rounded-full border-2 border-slate-200 shrink-0" />}
                      {r.status === 'sending'  && <Loader2 className="h-4 w-4 animate-spin text-amber-500 shrink-0" />}
                      {r.status === 'sent'     && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                      {r.status === 'failed'   && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      {r.status === 'no_phone' && <AlertTriangle className="h-4 w-4 text-slate-300 shrink-0" />}
                      <span className={cn('truncate text-[12px] font-bold', r.status === 'no_phone' ? 'text-slate-400' : 'text-[#0B1828] dark:text-foreground')}>
                        {r.name}
                      </span>
                    </div>
                    <span className={cn('shrink-0 text-[10px] font-black uppercase',
                      r.status === 'sent'     ? 'text-emerald-600' :
                      r.status === 'failed'   ? 'text-red-500' :
                      r.status === 'sending'  ? 'text-amber-600' :
                      r.status === 'no_phone' ? 'text-slate-300' : 'text-slate-400'
                    )}>
                      {r.status === 'sent'     ? 'أُرسلت' :
                       r.status === 'failed'   ? 'فشل' :
                       r.status === 'sending'  ? 'جاري…' :
                       r.status === 'no_phone' ? 'لا رقم' : 'انتظار'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        {step === 'sending' && (
          <div className="border-t border-slate-100 p-4 dark:border-sira-border">
            <button
              onClick={() => { cancelledRef.current = true; clearCountdown(); setStep('done'); }}
              className="w-full rounded-2xl border border-red-200 bg-red-50 py-3 text-[12px] font-black text-red-600 transition hover:bg-red-100"
            >
              إيقاف الإرسال
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="border-t border-slate-100 p-4 dark:border-sira-border">
            <button onClick={onClose} className="w-full rounded-2xl bg-[#0B1828] py-3 text-[12px] font-black text-white transition hover:bg-slate-800">
              إغلاق
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
