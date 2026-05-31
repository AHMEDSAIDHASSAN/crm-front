/**
 * Map labels “Check-in / Check-out” mean GPS capture at meeting start/end (currentLocation / checkoutLocation).
 * They are not the same as MeetingStatus (scheduled / in_progress / completed / …).
 */
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MeetingLocationsMap.css';

/** Parse "lat, lng" (or two numbers separated by whitespace) from stored meeting strings. */
export function parseMeetingLatLng(raw: unknown): { lat: number; lng: number } | null {
    if (raw == null) return null;
    const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
    if (!s) return null;

    const tryPair = (a: string, b: string): { lat: number; lng: number } | null => {
        const lat = Number(a);
        const lng = Number(b);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { lat, lng };
    };

    const comma = s.split(',').map((x) => x.trim());
    if (comma.length >= 2) {
        const p = tryPair(comma[0], comma[1]);
        if (p) return p;
    }

    const sp = s.split(/\s+/).filter(Boolean);
    if (sp.length >= 2) {
        const p = tryPair(sp[0], sp[1]);
        if (p) return p;
    }

    return null;
}

/** Resolve props for the map: camelCase + snake_case, GPS strings only (skip placeholders like "Current location"). */
export function resolveMeetingMapCoords(
    meeting: Record<string, unknown> | null | undefined,
    explicit: { planned?: string | null; checkIn?: string | null; checkOut?: string | null },
): { planned: string | null; checkIn: string | null; checkOut: string | null } {
    const m = meeting ?? {};
    const pick = (camel: string, snake?: string): string | null => {
        const v = (m as any)[camel] ?? (snake != null ? (m as any)[snake] : undefined);
        if (v == null || String(v).trim() === '') return null;
        return String(v).trim();
    };

    const plannedRaw =
        explicit.planned != null && String(explicit.planned).trim() !== ''
            ? String(explicit.planned).trim()
            : pick('location');

    let checkIn =
        explicit.checkIn != null && String(explicit.checkIn).trim() !== ''
            ? String(explicit.checkIn).trim()
            : pick('currentLocation', 'current_location');

    let checkOut =
        explicit.checkOut != null && String(explicit.checkOut).trim() !== ''
            ? String(explicit.checkOut).trim()
            : pick('checkoutLocation', 'checkout_location');

    if (checkIn && !parseMeetingLatLng(checkIn)) checkIn = null;
    if (checkOut && !parseMeetingLatLng(checkOut)) checkOut = null;

    const planned = plannedRaw && parseMeetingLatLng(plannedRaw) ? plannedRaw : null;

    // Started meeting but check-in field is missing or a non-GPS placeholder — use planned coords if they are GPS
    if (!checkIn && m.startedAt && planned) {
        checkIn = planned;
    }

    return { planned, checkIn, checkOut };
}

function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    const key = positions.map((p) => `${p[0]},${p[1]}`).join('|');

    useEffect(() => {
        if (positions.length === 0) return;
        if (positions.length === 1) {
            map.setView(positions[0], 15);
            return;
        }
        map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: 16 });
    }, [map, key, positions]);

    return null;
}

type MapPoint = {
    key: string;
    role: 'planned' | 'checkIn' | 'checkOut';
    label: string;
    /** Where the marker is drawn (may be nudged if another pin shares the same GPS). */
    displayLat: number;
    displayLng: number;
    /** Original parsed coordinates (shown in popup). */
    storedLat: number;
    storedLng: number;
    mapOffset: boolean;
};

const ROLE_ORDER: MapPoint['role'][] = ['planned', 'checkIn', 'checkOut'];

/** Distinct shapes: check-in = circle (start), check-out = rounded square (end) so same GPS is still obvious. */
function makeRoleIcon(role: MapPoint['role']) {
    const shadow = 'box-shadow:0 1px 4px rgba(0,0,0,0.35)';
    if (role === 'checkOut') {
        return L.divIcon({
            className: 'meeting-map-role-icon',
            html: `<div style="width:13px;height:13px;border-radius:4px;background:#ef4444;border:2px solid #fff;${shadow}" title="Check-out"></div>`,
            iconSize: [17, 17],
            iconAnchor: [8, 8],
        });
    }
    if (role === 'checkIn') {
        return L.divIcon({
            className: 'meeting-map-role-icon',
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff;${shadow}" title="Check-in"></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
        });
    }
    return L.divIcon({
        className: 'meeting-map-role-icon',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid #fff;${shadow}" title="Planned"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
}

/** Group pins that are effectively the same place (~1.1 m) so string/float noise doesn’t split check-in / check-out. */
function posKey(lat: number, lng: number) {
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/** Display-only offset when check-in GPS === check-out GPS (~±35 m E/W, ~±15 m N/S at mid-lat). */
const CHECKIN_CHECKOUT_DLAT = 0.00013;
const CHECKIN_CHECKOUT_DLNG = 0.00034;

/**
 * When check-in and check-out share the same stored GPS, push them apart on the map (true coords stay in popup).
 */
function separateCheckInOutIfSameStored(points: MapPoint[]): MapPoint[] {
    const cin = points.find((p) => p.role === 'checkIn');
    const cout = points.find((p) => p.role === 'checkOut');
    if (!cin || !cout) return points;
    const eps = 1e-5;
    if (Math.abs(cin.storedLat - cout.storedLat) > eps || Math.abs(cin.storedLng - cout.storedLng) > eps) {
        return points;
    }
    const lat = cin.storedLat;
    const lng = cin.storedLng;
    return points.map((p) => {
        if (p.role === 'checkIn') {
            return { ...p, displayLat: lat + CHECKIN_CHECKOUT_DLAT, displayLng: lng - CHECKIN_CHECKOUT_DLNG, mapOffset: true };
        }
        if (p.role === 'checkOut') {
            return { ...p, displayLat: lat - CHECKIN_CHECKOUT_DLAT, displayLng: lng + CHECKIN_CHECKOUT_DLNG, mapOffset: true };
        }
        return p;
    });
}

/**
 * One marker per role (planned / check-in / check-out), never merged.
 * If several share the same coordinates, spread them on a ring; check-in vs check-out get an extra split when identical.
 */
function buildPoints(planned?: string | null, checkIn?: string | null, checkOut?: string | null): MapPoint[] {
    const slots: { role: MapPoint['role']; label: string; s?: string | null }[] = [
        { role: 'planned', label: 'Planned location', s: planned },
        { role: 'checkIn', label: 'Check-in (start)', s: checkIn },
        { role: 'checkOut', label: 'Check-out (end)', s: checkOut },
    ];

    const base: Omit<MapPoint, 'displayLat' | 'displayLng' | 'mapOffset'>[] = [];
    for (const { role, label, s } of slots) {
        const c = parseMeetingLatLng(s);
        if (!c) continue;
        base.push({
            key: role,
            role,
            label,
            storedLat: c.lat,
            storedLng: c.lng,
        });
    }

    const groups = new Map<string, typeof base>();
    for (const p of base) {
        const k = posKey(p.storedLat, p.storedLng);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(p);
    }

    /** Ring radius ~14–18 m at mid-lat when 2–3 pins share one spot */
    const SPREAD_R = 0.00016;
    const out: MapPoint[] = [];

    for (const group of groups.values()) {
        group.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
        const n = group.length;
        const roles = new Set(group.map((g) => g.role));
        const onlyCheckInOut = n === 2 && roles.has('checkIn') && roles.has('checkOut');

        if (onlyCheckInOut) {
            const pIn = group.find((g) => g.role === 'checkIn')!;
            const pOut = group.find((g) => g.role === 'checkOut')!;
            const lat = pIn.storedLat;
            const lng = pIn.storedLng;
            out.push({
                ...pIn,
                displayLat: lat + CHECKIN_CHECKOUT_DLAT,
                displayLng: lng - CHECKIN_CHECKOUT_DLNG,
                mapOffset: true,
            });
            out.push({
                ...pOut,
                displayLat: lat - CHECKIN_CHECKOUT_DLAT,
                displayLng: lng + CHECKIN_CHECKOUT_DLNG,
                mapOffset: true,
            });
            continue;
        }

        const offsetNeeded = n > 1;
        group.forEach((p, i) => {
            let displayLat = p.storedLat;
            let displayLng = p.storedLng;
            if (offsetNeeded) {
                const theta = -Math.PI / 2 + (2 * Math.PI * i) / n;
                displayLat = p.storedLat + SPREAD_R * Math.cos(theta);
                displayLng = p.storedLng + SPREAD_R * Math.sin(theta);
            }
            out.push({
                ...p,
                displayLat,
                displayLng,
                mapOffset: offsetNeeded,
            });
        });
    }

    const merged = separateCheckInOutIfSameStored(out);
    merged.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    return merged;
}

function zIndexForRole(role: MapPoint['role']): number {
    if (role === 'checkOut') return 750;
    if (role === 'checkIn') return 650;
    return 550;
}

export default function MeetingLocationsMap({
    planned,
    checkIn,
    checkOut,
    meeting,
    className = '',
    heightClass = 'h-[260px]',
    /** When true, marker popups show role label only (no lat/lng line) — use on lead detail for “map only” GPS. */
    hideCoordinateText = false,
}: {
    planned?: string | null;
    checkIn?: string | null;
    checkOut?: string | null;
    /** When set, reads camelCase + snake_case fields and applies check-in fallbacks (e.g. real GPS in `location` after start). */
    meeting?: Record<string, unknown> | null;
    className?: string;
    heightClass?: string;
    hideCoordinateText?: boolean;
}) {
    const resolved = useMemo(
        () => resolveMeetingMapCoords(meeting ?? null, { planned, checkIn, checkOut }),
        [meeting, planned, checkIn, checkOut],
    );
    const points = useMemo(
        () => buildPoints(resolved.planned, resolved.checkIn, resolved.checkOut),
        [resolved.planned, resolved.checkIn, resolved.checkOut],
    );
    const positions = useMemo((): [number, number][] => points.map((p) => [p.displayLat, p.displayLng]), [points]);

    if (points.length === 0) {
        return (
            <div
                className={`w-full rounded-xl border border-sira-border bg-foreground/5 px-4 py-8 text-center text-sm text-sira-text-muted ${className}`}
            >
                No GPS coordinates to show on the map. The planned field may be text-only, or check-in / check-out did not
                capture location.
            </div>
        );
    }

    const center = positions[0];

    const hasPlanned = points.some((p) => p.role === 'planned');

    return (
        <div className={`w-full overflow-hidden rounded-xl border border-sira-border ${className}`}>
            <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-2 border-b border-sira-border bg-foreground/5 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wide text-foreground/50 sm:justify-between">
                {hasPlanned ? (
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" /> Planned
                    </span>
                ) : null}
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-white shadow-sm shrink-0" /> Check-in (circle)
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-[3px] bg-red-500 border border-white shadow-sm shrink-0" /> Check-out (square)
                </span>
            </div>
            <div className={heightClass}>
                <MapContainer center={center} zoom={14} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <FitBounds positions={positions} />
                    {points.map((p) => (
                        <Marker
                            key={p.key}
                            position={[p.displayLat, p.displayLng]}
                            icon={makeRoleIcon(p.role)}
                            zIndexOffset={zIndexForRole(p.role)}
                        >
                            <Popup>
                                <div className="text-sm space-y-0.5">
                                    <p className="font-bold">{p.label}</p>
                                    {!hideCoordinateText ? (
                                        <p className="text-[11px] text-neutral-600 font-mono">
                                            {p.storedLat.toFixed(6)}, {p.storedLng.toFixed(6)}
                                        </p>
                                    ) : null}
                                    {p.mapOffset ? (
                                        <p className="text-[10px] text-neutral-500 pt-1">
                                            Pin placed slightly aside on the map for visibility — stored GPS is the same as another
                                            marker (e.g. check-in = check-out). Shape still shows start (circle) vs end (square).
                                        </p>
                                    ) : null}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
}

