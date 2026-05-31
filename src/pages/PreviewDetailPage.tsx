import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    ArrowLeft,
    Building2,
    CalendarDays,
    Clock,
    ExternalLink,
    Loader2,
    LogIn,
    LogOut,
    Mail,
    MapPin,
    Phone,
    User as UserIcon,
    X,
    Check,
    XCircle,
} from 'lucide-react';
import { toast } from '../lib/toast';
import MeetingLocationsMap from '../components/meetings/MeetingLocationsMap';
import { getCurrentLocationForPreview } from '../lib/previewGeolocation';
import { isAppRtl } from '../lib/i18nDirection';
import {
    PREVIEW_STATUS_STYLES,
    fmtDateTimePreview,
    googleMapsQueryUrl,
    latLngToMeetingMapString,
    normalizeLatLngForMap,
    previewDetailBanner,
    // previewFlowMeta,
    previewRequesterName,
} from '../lib/unitPreviewHelpers';
import { getUnitTypeLabel } from '../lib/unitDisplayHelpers';
import {
    getUnitPreviewById,
    checkInUnitPreview,
    checkOutUnitPreview,
    cancelUnitPreview,
    approveUnitPreview,
    rejectUnitPreview,
    type PreviewRow,
} from '../services/api';

const ELEVATED = ['super_admin', 'operation_manager', 'sales_manager', 'tech_lead'];

function previewClientErrorMessage(
    err: unknown,
    t: TFunction,
    fallbackKey: 'previewDetail.errors.checkInFailed' | 'previewDetail.errors.checkOutFailed' | 'previewDetail.errors.cancelFailed' | 'previewDetail.errors.approveFailed' | 'previewDetail.errors.rejectFailed',
): string {
    if (err && typeof err === 'object' && 'response' in err) {
        const m = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
        if (typeof m === 'string' && m.trim()) return m;
    }
    const raw =
        err instanceof Error
            ? err.message
            : err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: unknown }).message ?? '')
              : '';
    const msg = raw.trim();
    if (/permission denied/i.test(msg) || /Allow location for this site/i.test(msg)) {
        return t('previewDetail.errors.locationDenied');
    }
    if (/Location unavailable/i.test(msg)) return t('previewDetail.errors.locationUnavailable');
    if (/Location request timed out/i.test(msg)) return t('previewDetail.errors.locationTimeout');
    if (/does not support GPS/i.test(msg) || /Geolocation is not supported/i.test(msg)) {
        return t('previewDetail.errors.geolocationUnsupported');
    }
    if (/Could not get reliable/i.test(msg)) return t('previewDetail.errors.gpsUnreliable');
    if (/Could not get current location/i.test(msg)) return t('previewDetail.errors.gpsEnableGeneric');
    if (msg) return msg;
    return t(fallbackKey);
}

export default function PreviewDetailPage() {
    const { previewId } = useParams<{ previewId: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const isRtl = isAppRtl(i18n);
    const user = useSelector((state: { user?: { user?: Record<string, unknown> } }) => state.user?.user);
    const roleName =
        typeof user?.role === 'string' ? user.role : (user?.role as { name?: string } | undefined)?.name ?? '';
    const currentUserId = user?.id != null ? String(user.id) : '';
    const isElevated = ELEVATED.includes(roleName);

    const fromTab = searchParams.get('from') === 'incoming' ? 'incoming_requests' : 'previews';

    const [row, setRow] = useState<PreviewRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [gpsBusy, setGpsBusy] = useState<'in' | 'out' | null>(null);

    const load = useCallback(async () => {
        if (!previewId) return;
        setLoading(true);
        try {
            const data = await getUnitPreviewById(previewId);
            setRow(data);
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : null;
            toast.error(typeof msg === 'string' && msg.trim() ? msg : t('previewDetail.errors.loadFailed'));
            setRow(null);
        } finally {
            setLoading(false);
        }
    }, [previewId, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const banner = useMemo(
        () => (row ? previewDetailBanner(row, currentUserId, isElevated, t) : null),
        [row, currentUserId, isElevated, t],
    );

    /* const flow = useMemo(
        () => (row ? previewFlowMeta(row, currentUserId, t) : { headline: '', detail: '' }),
        [row, currentUserId, t],
    ); */

    const isRequester = row != null && String(row.requestedById) === currentUserId;
    const isOwner =
        row?.unit?.createdBy != null && String(row.unit.createdBy) === currentUserId;
    const canSeePreviewMaps = isElevated || isRequester;

    const inCoords = row ? normalizeLatLngForMap(row.checkInLat, row.checkInLng) : null;
    const outCoords = row ? normalizeLatLngForMap(row.checkOutLat, row.checkOutLng) : null;
    const checkInMapStr = latLngToMeetingMapString(inCoords);
    const checkOutMapStr = latLngToMeetingMapString(outCoords);

    const backHref = `/units?tab=${fromTab}`;

    const bannerClass =
        banner?.kind === 'requester_own'
            ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-emerald-600/5'
            : banner?.kind === 'requester_other'
              ? 'border-sky-500/40 bg-gradient-to-br from-sky-500/15 to-cyan-600/5'
              : banner?.kind === 'owner_incoming'
                ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-orange-600/5'
                : 'border-sira-border bg-muted/50';

    const bannerKindLabel =
        banner?.kind === 'owner_incoming'
            ? t('previewDetail.bannerKind.yourListing')
            : banner?.kind === 'requester_own' || banner?.kind === 'requester_other'
              ? t('previewDetail.bannerKind.youAreRequester')
              : t('previewDetail.bannerKind.overview');

    const statusLabel = row ? t(`previewDetail.status.${row.status}`, { defaultValue: row.status }) : '';

    const handleCheckIn = async () => {
        if (!row) return;
        setGpsBusy('in');
        try {
            toast.info(t('previewDetail.toast.gettingGpsCheckIn'));
            const gps = await getCurrentLocationForPreview();
            await checkInUnitPreview(row.id, gps.lat, gps.lng);
            const accText =
                gps.accuracyM != null
                    ? t('previewDetail.toast.accKnown', { meters: Math.round(gps.accuracyM) })
                    : t('previewDetail.toast.accUnknown');
            toast.success(
                t('previewDetail.toast.checkedIn', {
                    acc: accText,
                }),
            );
            await load();
        } catch (err: unknown) {
            toast.error(previewClientErrorMessage(err, t, 'previewDetail.errors.checkInFailed'));
        } finally {
            setGpsBusy(null);
        }
    };

    const handleCheckOut = async () => {
        if (!row) return;
        setGpsBusy('out');
        try {
            toast.info(t('previewDetail.toast.gettingGpsCheckOut'));
            const gps = await getCurrentLocationForPreview();
            await checkOutUnitPreview(row.id, gps.lat, gps.lng);
            const accText =
                gps.accuracyM != null
                    ? t('previewDetail.toast.accKnown', { meters: Math.round(gps.accuracyM) })
                    : t('previewDetail.toast.accUnknown');
            toast.success(
                t('previewDetail.toast.checkedOut', {
                    acc: accText,
                }),
            );
            await load();
        } catch (err: unknown) {
            toast.error(previewClientErrorMessage(err, t, 'previewDetail.errors.checkOutFailed'));
        } finally {
            setGpsBusy(null);
        }
    };

    const handleCancel = async () => {
        if (!row || !window.confirm(t('previewDetail.confirmCancelPreview'))) return;
        try {
            await cancelUnitPreview(row.id);
            toast.success(t('previewDetail.toast.previewCancelled'));
            navigate(backHref);
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : null;
            toast.error(typeof msg === 'string' && msg.trim() ? msg : t('previewDetail.errors.cancelFailed'));
        }
    };

    const handleApprove = async () => {
        if (!row) return;
        try {
            await approveUnitPreview(row.id);
            toast.success(t('previewDetail.toast.approveSuccess'));
            await load();
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : null;
            toast.error(typeof msg === 'string' && msg.trim() ? msg : t('previewDetail.errors.approveFailed'));
        }
    };

    const handleReject = async () => {
        if (!row || !window.confirm(t('previewDetail.confirmReject'))) return;
        try {
            await rejectUnitPreview(row.id);
            toast.success(t('previewDetail.toast.previewRejected'));
            navigate(backHref);
        } catch (err: unknown) {
            const msg =
                err && typeof err === 'object' && 'response' in err
                    ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                    : null;
            toast.error(typeof msg === 'string' && msg.trim() ? msg : t('previewDetail.errors.rejectFailed'));
        }
    };

    if (loading) {
        return (
            <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-slate-500"
            >
                <Loader2 className="h-10 w-10 animate-spin text-[#0B1828]" />
                {t('previewDetail.loading')}
            </div>
        );
    }

    if (!row) {
        return (
            <div
                dir={isRtl ? 'rtl' : 'ltr'}
                className="mx-auto mt-12 max-w-lg rounded-[2.5rem] border border-slate-50 bg-white p-8 text-center shadow-sm"
            >
                <p className="mb-4 font-bold text-slate-400">{t('previewDetail.notFound')}</p>
                <Link
                    to={backHref}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0B1828] px-6 py-3 text-sm font-black text-white"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t('previewDetail.backToUnits')}
                </Link>
            </div>
        );
    }

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className="space-y-6 p-4 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
                <Link
                    to={backHref}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50"
                >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    {t('previewDetail.back')}
                </Link>
                {row.unit?.id != null ? (
                    <Link
                        to={`/units/${row.unit.id}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#0B1828] transition-all hover:bg-slate-100"
                    >
                        <Building2 className="h-4 w-4" />
                        {t('previewDetail.openUnit')}
                    </Link>
                ) : null}
            </div>

            {banner ? (
                <div className={`rounded-[2.5rem] border p-6 shadow-sm ${bannerClass}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        {bannerKindLabel}
                    </p>
                    <h1 className="mt-1 text-2xl font-black tracking-tight text-[#0B1828] md:text-3xl">
                        {banner.title}
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{banner.subtitle}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                            className={`inline-block rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${PREVIEW_STATUS_STYLES[row.status] || ''}`}
                        >
                            {statusLabel}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#0B1828]">{row.unit?.code ?? '—'}</span>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                        {t('previewDetail.clientVisit')}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-lg font-black text-[#0B1828]">
                        <UserIcon className="h-5 w-5 text-slate-400" />
                        {row.clientName}
                    </p>
                    {row.clientPhone ? (
                        <a
                            href={`tel:${row.clientPhone}`}
                            className="mt-2 flex items-center gap-2 text-sm font-bold text-blue-600"
                            dir="ltr"
                        >
                            <Phone className="h-4 w-4" />
                            {row.clientPhone}
                        </a>
                    ) : null}
                </div>
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                        {t('previewDetail.schedule')}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[#0B1828]">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        {fmtDateTimePreview(row.scheduledAt, i18n.language)}
                    </p>
                    {row.durationMin ? (
                        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                            <Clock className="h-4 w-4" />
                            {t('previewDetail.minutes', { count: row.durationMin })}
                        </p>
                    ) : null}
                </div>
            </div>

            {isOwner && !isRequester ? (
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                        {t('previewDetail.requester')}
                    </p>
                    <p className="mt-1 text-lg font-black text-[#0B1828]">
                        {previewRequesterName(row.requestedBy, t)}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 text-sm">
                        {row.requestedBy?.email ? (
                            <a
                                href={`mailto:${row.requestedBy.email}`}
                                className="flex items-center gap-2 font-bold text-blue-600"
                            >
                                <Mail className="h-4 w-4 shrink-0" />
                                {row.requestedBy.email}
                            </a>
                        ) : null}
                        {row.requestedBy?.phone ? (
                            <a href={`tel:${row.requestedBy.phone}`} className="flex items-center gap-2" dir="ltr">
                                <Phone className="h-4 w-4 shrink-0" />
                                {row.requestedBy.phone}
                            </a>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {row.unit ? (
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                        <Building2 className="h-3.5 w-3.5" />
                        {t('previewDetail.unit')}
                    </p>
                    <p className="mt-2 text-lg font-black text-[#0B1828]">{row.unit.code}</p>
                    {row.unit.projectName ? (
                        <p className="text-sm text-slate-500">{row.unit.projectName}</p>
                    ) : null}
                    {row.unit.unitType ? (
                        <p className="text-xs text-slate-500">{getUnitTypeLabel(String(row.unit.unitType))}</p>
                    ) : null}
                    {row.unit.address ? <p className="mt-2 text-sm text-slate-700">{row.unit.address}</p> : null}
                    {row.unit.location ? <p className="text-xs text-slate-500">{row.unit.location}</p> : null}
                </div>
            ) : null}

            {row.notes ? (
                <p className="rounded-[2rem] border border-slate-50 bg-white px-5 py-4 text-sm text-slate-700 shadow-sm">
                    {row.notes}
                </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                        {t('previewDetail.checkInGps')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#0B1828]">
                        {row.checkInAt
                            ? fmtDateTimePreview(row.checkInAt, i18n.language)
                            : t('previewDetail.notRecordedYet')}
                    </p>
                    {inCoords ? (
                        <>
                            <a
                                href={googleMapsQueryUrl(inCoords.lat, inCoords.lng)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-xs font-black text-blue-600"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('previewDetail.mapsLink')}
                            </a>
                        </>
                    ) : !row.checkInAt ? (
                        <p className="mt-2 text-xs text-slate-500">{t('previewDetail.savedWhenCheckIn')}</p>
                    ) : null}
                </div>
                <div className="rounded-[2rem] border border-slate-50 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                        {t('previewDetail.checkOutGps')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-[#0B1828]">
                        {row.checkOutAt
                            ? fmtDateTimePreview(row.checkOutAt, i18n.language)
                            : t('previewDetail.notRecordedYet')}
                    </p>
                    {outCoords ? (
                        <>
                            <a
                                href={googleMapsQueryUrl(outCoords.lat, outCoords.lng)}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-xs font-black text-blue-600"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('previewDetail.mapsLink')}
                            </a>
                        </>
                    ) : !row.checkOutAt ? (
                        <p className="mt-2 text-xs text-slate-500">{t('previewDetail.savedWhenCheckOut')}</p>
                    ) : null}
                </div>
            </div>

            {canSeePreviewMaps && (checkInMapStr || checkOutMapStr) ? (
                <div className="overflow-hidden rounded-[2rem] border border-slate-50 bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
                        <MapPin className="h-4 w-4 text-[#0B1828]" />
                        <h3 className="text-xs font-black uppercase text-slate-500">
                            {t('previewDetail.mapCaption')}
                        </h3>
                    </div>
                    <div className="p-2">
                        <MeetingLocationsMap
                            checkIn={checkInMapStr}
                            checkOut={checkOutMapStr}
                            heightClass="h-[320px]"
                        />
                    </div>
                </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-6">
                {isRequester ? (
                    <>
                        {row.status === 'pending' && (
                            <button
                                type="button"
                                onClick={() => void handleCancel()}
                                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-700 transition-all hover:bg-rose-600 hover:text-white"
                            >
                                <X className="h-4 w-4" />
                                {t('previewDetail.cancelRequest')}
                            </button>
                        )}
                        {row.status === 'scheduled' && (
                            <>
                                <button
                                    type="button"
                                    disabled={gpsBusy !== null}
                                    onClick={() => void handleCheckIn()}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#0B1828] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-slate-800 disabled:opacity-50"
                                >
                                    {gpsBusy === 'in' ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <LogIn className="h-4 w-4" />
                                    )}
                                    {t('previewDetail.btnCheckInGps')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleCancel()}
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#0B1828] transition-all hover:bg-slate-50"
                                >
                                    {t('common.cancel')}
                                </button>
                            </>
                        )}
                        {row.status === 'checked_in' && (
                            <button
                                type="button"
                                disabled={gpsBusy !== null}
                                onClick={() => void handleCheckOut()}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
                            >
                                {gpsBusy === 'out' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <LogOut className="h-4 w-4" />
                                )}
                                {t('previewDetail.btnCheckOutGps')}
                            </button>
                        )}
                    </>
                ) : null}
                {isOwner && !isRequester && row.status === 'pending' ? (
                    <>
                        <button
                            type="button"
                            onClick={() => void handleApprove()}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-all hover:bg-emerald-600 hover:text-white"
                        >
                            <Check className="h-4 w-4" />
                            {t('previewDetail.approve')}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleReject()}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-700 transition-all hover:bg-rose-600 hover:text-white"
                        >
                            <XCircle className="h-4 w-4" />
                            {t('previewDetail.reject')}
                        </button>
                    </>
                ) : null}
            </div>
        </div>
    );
}

