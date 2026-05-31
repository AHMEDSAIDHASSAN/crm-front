import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Wifi, WifiOff, LogOut, RefreshCw, Loader2, CheckCircle2, Smartphone } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { cn } from '../lib/utils';
import { toast } from '../lib/toast';
import { useSelector } from 'react-redux';
import { getCanonicalRoleName } from '../lib/userRole';

type WAStatus = 'idle' | 'loading' | 'qr' | 'ready' | 'disconnected';

interface WAState {
  status: WAStatus;
  qr?: string | null;
  number?: string | null;
  reason?: string;
}

export default function WhatsAppWebConnect() {
  const [state, setState] = useState<WAState>({ status: 'idle' });
  const socketRef = useRef<Socket | null>(null);
  const [connecting, setConnecting] = useState(false);
  const user = useSelector((state: any) => state.user.user);
  const isSales = getCanonicalRoleName(user) === 'sales';

  useEffect(() => {
    const token = localStorage.getItem('token') ?? undefined;
    const socket = io('/whatsapp-web', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Get current state — if idle, auto-start so QR appears immediately
      socket.emit('wa:get-state');
      socket.once('wa:status', (data: WAState) => {
        if (data.status === 'idle') {
          socket.emit('wa:start');
        }
      });
    });

    socket.on('wa:status', (data: WAState) => {
      setState(data);
      setConnecting(false);
    });

    socket.on('disconnect', () => {
      setState((prev) => ({ ...prev, status: prev.status === 'ready' ? 'ready' : 'disconnected' }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleStart = () => {
    if (!socketRef.current) return;
    setConnecting(true);
    setState({ status: 'loading' });
    socketRef.current.emit('wa:start');
  };

  const handleLogout = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('wa:logout');
    toast.success('تم قطع الاتصال بواتساب');
  };

  const statusConfig: Record<WAStatus, { label: string; color: string; bg: string; border: string }> = {
    idle:         { label: 'غير متصل', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
    loading:      { label: 'جاري التحميل…', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
    qr:           { label: 'في انتظار المسح', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
    ready:        { label: 'متصل ✓', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    disconnected: { label: 'انقطع الاتصال', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  };

  const cfg = statusConfig[state.status];

  return (
    <div className="space-y-6 max-w-lg" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#16a34a] text-white shadow-lg shadow-[#16a34a]/30">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            {isSales ? 'واتسابك الشخصي' : 'إعدادات النظام'}
          </p>
          <h1 className="text-2xl font-black text-[#0B1828] dark:text-foreground">ربط واتساب</h1>
        </div>
      </div>

      {/* Status card */}
      <div className={cn('rounded-2xl border-2 p-5 flex items-center justify-between gap-4', cfg.bg, cfg.border)}>
        <div className="flex items-center gap-3">
          {state.status === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-amber-500" />}
          {state.status === 'ready'   && <Wifi className="h-5 w-5 text-emerald-600" />}
          {state.status === 'qr'      && <Smartphone className="h-5 w-5 text-blue-600 animate-pulse" />}
          {(state.status === 'idle' || state.status === 'disconnected') && <WifiOff className="h-5 w-5 text-slate-500" />}
          <div>
            <p className={cn('text-[13px] font-black', cfg.color)}>{cfg.label}</p>
            {state.status === 'ready' && state.number && (
              <p className="text-[11px] font-bold text-slate-500">+{state.number}</p>
            )}
            {state.status === 'qr' && (
              <p className="text-[11px] font-bold text-blue-600">افتح واتساب → الأجهزة المرتبطة → ربط جهاز</p>
            )}
          </div>
        </div>
        {state.status === 'ready' && (
          <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
        )}
      </div>

      {/* QR Code */}
      {state.status === 'qr' && state.qr && (
        <div className="rounded-2xl border-2 border-blue-200 bg-white p-6 flex flex-col items-center gap-4 shadow-lg shadow-blue-100">
          <div className="text-center">
            <p className="text-[13px] font-black text-[#0B1828] mb-1">امسح الكود بواتساب</p>
            <p className="text-[11px] font-bold text-slate-400">واتساب ← النقاط الثلاث ← الأجهزة المرتبطة</p>
          </div>
          <img
            src={state.qr}
            alt="WhatsApp QR Code"
            className="w-56 h-56 rounded-2xl border border-slate-100"
          />
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            الكود يتجدد تلقائياً
          </div>
        </div>
      )}

      {/* Connected info */}
      {state.status === 'ready' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 space-y-3">
          <p className="text-[13px] font-black text-emerald-800">🎉 واتساب متصل بالنظام</p>
          <p className="text-[11px] font-bold text-emerald-700">
            {isSales
              ? 'رسائل العملاء ستُرسل من واتسابك الشخصي هذا.'
              : 'الرسائل التلقائية للعملاء الجدد والمسحوبة ستُرسل عبر هذا الرقم.'}
          </p>
          {state.number && (
            <div className="rounded-xl bg-white border border-emerald-200 px-4 py-2 text-[13px] font-black text-[#0B1828] dir-ltr text-left">
              +{state.number}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        {(state.status === 'idle' || state.status === 'disconnected') && (
          <button
            onClick={handleStart}
            disabled={connecting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] py-4 text-[13px] font-black text-white shadow-md transition hover:bg-[#15803d] disabled:opacity-40"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {connecting ? 'جاري الاتصال…' : 'ابدأ الربط بواتساب'}
          </button>
        )}

        {state.status === 'loading' && (
          <div className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-100 py-4 text-[13px] font-black text-amber-700">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تجهيز الاتصال… قد يستغرق دقيقة
          </div>
        )}

        {state.status === 'ready' && (
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-4 text-[13px] font-black text-red-600 transition hover:bg-red-100"
          >
            <LogOut className="h-4 w-4" />
            قطع الاتصال وتسجيل الخروج
          </button>
        )}

        {state.status === 'qr' && (
          <button
            onClick={handleStart}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 py-3 text-[12px] font-black text-slate-600 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            تجديد الكود
          </button>
        )}
      </div>
    </div>
  );
}
