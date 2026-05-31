import { useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isAppRtl } from '../../lib/i18nDirection';
import { cn } from '../../lib/utils';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Primary title (localized). */
    title: ReactNode;
    /** Optional English / secondary line (uppercase, muted) — e.g. "SCHEDULE NEW APPOINTMENT". */
    subtitle?: string;
    /** Optional icon or badge shown beside the title (e.g. CRM “injection” lightning). */
    headerIcon?: ReactNode;
    children: ReactNode;
    /** Document direction for RTL layouts (e.g. Arabic). */
    dir?: 'ltr' | 'rtl';
    /** Max width of the dialog panel. */
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

const sizeClass: Record<NonNullable<ModalProps['size']>, string> = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    '2xl': 'max-w-3xl',
    '3xl': 'max-w-4xl',
    '4xl': 'max-w-5xl',
};

export default function Modal({
    isOpen,
    onClose,
    title,
    subtitle,
    headerIcon,
    children,
    dir,
    size = 'lg',
}: ModalProps) {
    const { t, i18n } = useTranslation();
    const resolvedDir = useMemo((): 'ltr' | 'rtl' => {
        if (dir === 'ltr' || dir === 'rtl') return dir;
        return isAppRtl(i18n) ? 'rtl' : 'ltr';
    }, [dir, i18n.language, i18n.resolvedLanguage]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleEscape);
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[20000] flex items-center justify-center p-4 sm:p-6"
            role="presentation"
        >
            <div
                className="modal-backdrop-scrim absolute inset-0 transition-opacity"
                onClick={onClose}
                aria-hidden
            />

            <div
                dir={resolvedDir}
                lang={i18n.language}
                // CRM reference: dialogs stay light paper + tinted body even when app theme is dark
                style={{ colorScheme: 'light' }}
                className={cn(
                    'crm-modal-scope relative z-10 flex min-h-0 max-h-[min(92vh,calc(100vh-1.5rem))] w-full flex-col overflow-hidden rounded-[2rem] border-2 border-[#0B1828] bg-white text-[#0B1828] shadow-[0_28px_90px_rgba(11,24,40,0.16)] ring-1 ring-black/[0.04] animate-in fade-in zoom-in-95 duration-200 sm:rounded-[2.25rem]',
                    sizeClass[size],
                )}
            >
                {/* Close: visual top-end (RTL → top-left of screen flow) */}
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute end-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-[#0B1828] bg-white text-slate-500 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-[#0B1828] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1828]/25"
                    aria-label={t('common.close')}
                >
                    <X className="h-5 w-5" strokeWidth={2} />
                </button>

                <div className="shrink-0 border-b border-slate-100 bg-white px-5 pb-4 pt-12 sm:px-8 sm:pb-5 sm:pt-16">
                    <div className="flex flex-row items-start gap-3 sm:gap-4">
                        {headerIcon ? <div className="mt-0.5 shrink-0">{headerIcon}</div> : null}
                        <div className="min-w-0 flex-1">
                            <h2 className="text-start text-lg font-black leading-snug tracking-tight text-slate-900 sm:text-2xl sm:leading-snug">
                                {title}
                            </h2>
                            {subtitle ? (
                                <p className="mt-1.5 text-start text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                                    {subtitle}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div
                    dir={resolvedDir}
                    lang={i18n.language}
                    className="custom-scrollbar modal-surface min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-7"
                >
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    );
}
