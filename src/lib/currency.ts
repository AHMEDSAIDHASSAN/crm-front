/**
 * Formats a number or string as EGP currency.
 * Supports locale-based formatting (Arabic/English).
 */
export function formatMoney(n: number | string | null | undefined, locale?: string) {
    if (n == null || n === '') return '\u2014'; // em dash
    const num = typeof n === 'string' ? parseFloat(n) : Number(n);
    if (Number.isNaN(num)) return '\u2014';
    
    const loc = locale?.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
    
    return new Intl.NumberFormat(loc, {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0,
    }).format(num);
}
