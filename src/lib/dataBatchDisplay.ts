import type { TFunction } from 'i18next';

/** Batch `dataSource`: `ads` = project marketing, `resale` = resale path (set when user picks Resale under Ads in bulk). */
export function dataBatchMarketingLabel(dataSource: string | undefined | null, t: TFunction): string {
    const ds = String(dataSource || '').toLowerCase();
    if (ds === 'resale') return t('leads.batchKindResale');
    if (ds === 'ads') return t('leads.batchKindAdsProject');
    if (!ds) return '—';
    return ds.toUpperCase();
}

/**
 * Short tag for lead-list subtitle when inbound already shows the channel (e.g. "إعلانات"):
 * append "مشروع" for ads batch or "إعادة بيع" for resale — avoids duplicating "إعلانات".
 */
export function dataBatchLeadSourceSuffix(dataSource: string | undefined | null, t: TFunction): string {
    const ds = String(dataSource || '').toLowerCase();
    if (ds === 'resale') return t('leads.batchKindResale');
    if (ds === 'ads') return t('leads.batchMarketingProjectTag');
    return '';
}
