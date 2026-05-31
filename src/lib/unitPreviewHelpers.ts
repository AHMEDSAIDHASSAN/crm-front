import type { TFunction } from 'i18next';
import type { PreviewRow } from '../services/api';

export const PREVIEW_STATUS_STYLES: Record<string, string> = {
    pending:
        'bg-orange-500/15 text-orange-900 border-orange-500/35 dark:text-orange-200 dark:border-orange-500/30',
    scheduled:
        'bg-amber-500/15 text-amber-900 border-amber-500/35 dark:text-amber-200 dark:border-amber-500/30',
    checked_in:
        'bg-cyan-500/15 text-cyan-900 border-cyan-500/35 dark:text-cyan-300 dark:border-cyan-500/30',
    checked_out:
        'bg-emerald-500/15 text-emerald-900 border-emerald-500/35 dark:text-emerald-300 dark:border-emerald-500/30',
    cancelled:
        'bg-muted text-muted-foreground border-border dark:bg-foreground/10 dark:text-foreground/40 dark:border-foreground/15',
};

export function fmtDateTimePreview(iso: string | null | undefined, locale?: string) {
    if (!iso) return '—';
    const d = new Date(iso);
    const loc =
        typeof locale === 'string' && locale.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
    return d.toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtLatLngPair(lat: number, lng: number) {
    return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
}

export function googleMapsQueryUrl(lat: number, lng: number) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** How this preview was booked: own listing vs another agent's unit (approval flow). */
export function previewFlowMeta(
    pr: PreviewRow,
    currentUserId: string,
    t: TFunction,
): { headline: string; detail: string } {
    const ownerId = pr.unit?.createdBy != null ? String(pr.unit.createdBy) : '';
    const isMyListing = ownerId !== '' && ownerId === currentUserId;
    const codeSuffix = pr.unit?.code ? ` · ${pr.unit.code}` : '';
    if (pr.status === 'pending') {
        const named =
            pr.unit?.creator &&
            [pr.unit.creator.firstName, pr.unit.creator.lastName].filter(Boolean).join(' ').trim();
        return named
            ? {
                  headline: t('previewDetail.flow.pending.headlineNamed', { name: named }),
                  detail: t('previewDetail.flow.pending.detailNamed', { name: named, codeSuffix }),
              }
            : {
                  headline: t('previewDetail.flow.pending.headlineGeneric'),
                  detail: t('previewDetail.flow.pending.detailGeneric', { codeSuffix }),
              };
    }
    if (pr.status === 'cancelled') {
        return {
            headline: isMyListing
                ? t('previewDetail.flow.cancelled.headlineOwn')
                : t('previewDetail.flow.cancelled.headlineOther'),
            detail: t('previewDetail.flow.cancelled.detail'),
        };
    }
    if (pr.status === 'scheduled') {
        return {
            headline: isMyListing
                ? t('previewDetail.flow.scheduled.headlineOwn')
                : t('previewDetail.flow.scheduled.headlineOther'),
            detail: t('previewDetail.flow.scheduled.detail'),
        };
    }
    if (pr.status === 'checked_in') {
        return {
            headline: isMyListing
                ? t('previewDetail.flow.checkedIn.headlineOwn')
                : t('previewDetail.flow.checkedIn.headlineOther'),
            detail: t('previewDetail.flow.checkedIn.detail'),
        };
    }
    if (pr.status === 'checked_out') {
        return {
            headline: isMyListing
                ? t('previewDetail.flow.checkedOut.headlineOwn')
                : t('previewDetail.flow.checkedOut.headlineOther'),
            detail: t('previewDetail.flow.checkedOut.detail'),
        };
    }
    if (isMyListing) {
        return {
            headline: t('previewDetail.flow.default.headlineOwn'),
            detail: t('previewDetail.flow.default.detailOwn'),
        };
    }
    return {
        headline: t('previewDetail.flow.default.headlineOther'),
        detail: t('previewDetail.flow.default.detailOther'),
    };
}

export function previewRequesterName(rb: PreviewRow['requestedBy'], t: TFunction): string {
    if (!rb) return t('previewDetail.unknownUser');
    const n = [rb.firstName, rb.lastName].filter(Boolean).join(' ').trim();
    return n || t('previewDetail.unknownUser');
}

export function previewRequesterInitials(rb: PreviewRow['requestedBy']): string {
    const a = (rb?.firstName?.[0] || '').toUpperCase();
    const b = (rb?.lastName?.[0] || '').toUpperCase();
    const s = `${a}${b}`.slice(0, 2);
    return s || '?';
}

export function normalizeLatLngForMap(
    latRaw: number | string | null | undefined,
    lngRaw: number | string | null | undefined,
): { lat: number; lng: number } | null {
    if (latRaw == null || lngRaw == null) return null;
    let lat = Number(latRaw);
    let lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat >= 22 && lat <= 36 && lng >= 22 && lng <= 36 && lat > lng) {
        [lat, lng] = [lng, lat];
    }
    return { lat, lng };
}

export function latLngToMeetingMapString(c: { lat: number; lng: number } | null): string | null {
    if (!c) return null;
    return `${c.lat}, ${c.lng}`;
}

export type PreviewBannerKind = 'requester_own' | 'requester_other' | 'owner_incoming' | 'admin';

export function previewDetailBanner(
    pr: PreviewRow,
    currentUserId: string,
    isElevatedRole: boolean,
    t: TFunction,
): { kind: PreviewBannerKind; title: string; subtitle: string } {
    const ownerId = pr.unit?.createdBy != null ? String(pr.unit.createdBy) : '';
    const isRequester = String(pr.requestedById) === currentUserId;
    const isOwner = ownerId !== '' && ownerId === currentUserId;
    const requesterName = previewRequesterName(pr.requestedBy, t);

    if (isElevatedRole && !isRequester && !isOwner) {
        return {
            kind: 'admin',
            title: t('previewDetail.banner.admin.title'),
            subtitle: t('previewDetail.banner.admin.subtitle'),
        };
    }
    if (isOwner && !isRequester) {
        return {
            kind: 'owner_incoming',
            title: t('previewDetail.banner.ownerIncoming.title'),
            subtitle: t('previewDetail.banner.ownerIncoming.subtitle', { requesterName }),
        };
    }
    if (isRequester && ownerId === currentUserId) {
        return {
            kind: 'requester_own',
            title: t('previewDetail.banner.requesterOwn.title'),
            subtitle: t('previewDetail.banner.requesterOwn.subtitle'),
        };
    }
    if (isRequester) {
        return {
            kind: 'requester_other',
            title: t('previewDetail.banner.requesterOther.title'),
            subtitle: t('previewDetail.banner.requesterOther.subtitle'),
        };
    }
    return {
        kind: 'admin',
        title: t('previewDetail.banner.fallback.title'),
        subtitle: t('previewDetail.banner.fallback.subtitle'),
    };
}
