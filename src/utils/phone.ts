/**
 * Standardizes phone numbers to Egyptian format (+20...).
 * - Adds +2 to 01... (e.g. 01222... -> +201222...)
 * - Adds +20 to 1... (e.g. 1222... -> +201222...)
 * - Adds + to 201... (e.g. 201222... -> +201222...)
 * - Ensures + prefix for other numbers.
 */
export function formatPhoneWithCountryCode(phone: string | null | undefined): string {
    if (!phone) return '';

    // Remove all non-digit/plus characters
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Already correct format +20...
    if (cleaned.startsWith('+20')) return cleaned;

    // 201... without plus → +201...
    if (cleaned.startsWith('201')) return '+' + cleaned;

    // Any number starting with 0 → add +2 (e.g. 01222... → +201222...)
    if (cleaned.startsWith('0')) return '+2' + cleaned;

    // 10-digit starting with 1 (Egyptian mobile without leading 0) → +201...
    if (cleaned.startsWith('1') && cleaned.length === 10) return '+20' + cleaned;

    // Default: add + if missing
    if (cleaned.length >= 7 && !cleaned.startsWith('+')) return '+' + cleaned;

    return cleaned;
}

/**
 * Returns digits only for WhatsApp/Tel links, ensuring 20 prefix for Egyptian numbers.
 */
export function getPhoneDigits(phone: string | null | undefined): string {
    const formatted = formatPhoneWithCountryCode(phone);
    return formatted.replace(/[^0-9]/g, '');
}
