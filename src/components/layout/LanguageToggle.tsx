import { useTranslation } from 'react-i18next';
import { isAppRtl } from '../../lib/i18nDirection';
import { Languages } from 'lucide-react';
import { cn } from '../../lib/utils';

type LanguageToggleProps = {
    className?: string;
};

export default function LanguageToggle({ className = '' }: LanguageToggleProps) {
    const { i18n } = useTranslation();
    const isArabic = isAppRtl(i18n);

    const toggleLanguage = async () => {
        const nextLang = isArabic ? 'en' : 'ar';
        await i18n.changeLanguage(nextLang);
        // Force direction update if needed, though i18next-react usually handles it
        document.documentElement.dir = nextLang === 'ar' ? 'rtl' : 'ltr';
    };

    return (
        <button
            type="button"
            onClick={() => void toggleLanguage()}
            className={cn(
                "flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 transition-all hover:bg-slate-100 group shadow-sm active:scale-95",
                className
            )}
            title={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
        >
            <Languages className="h-4 w-4 text-[#BF9B30] group-hover:rotate-12 transition-transform" />
            <span className="text-[11px] font-black uppercase tracking-widest text-[#0B1828]">
                {isArabic ? 'EN' : 'العربية'}
            </span>
        </button>
    );
}

