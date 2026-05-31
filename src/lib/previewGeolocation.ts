import { getMeetingGpsPosition } from '../utils/meetingGeolocation';

/**
 * Preview check-in / check-out GPS.
 * Uses the exact same geolocation strategy as Meetings to keep behavior identical.
 */
export type PreviewGpsResult = {
    lat: number;
    lng: number;
    /** Browser-reported horizontal accuracy in meters, if available */
    accuracyM: number | null;
};

const PREVIEW_TARGET_ACCURACY_M = 60;
const PREVIEW_MAX_ATTEMPTS = 2;

export function getCurrentLocationForPreview(): Promise<PreviewGpsResult> {
    return new Promise(async (resolve, reject) => {
        if (typeof navigator === 'undefined') {
            reject(
                new Error(
                    'This browser does not support GPS. Use Chrome or Safari on your phone, allow location, and try again.',
                ),
            );
            return;
        }
        try {
            let best: PreviewGpsResult | null = null;
            for (let attempt = 0; attempt < PREVIEW_MAX_ATTEMPTS; attempt += 1) {
                const pos = await getMeetingGpsPosition();
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                    continue;
                }
                const accuracy =
                    pos.coords.accuracy != null &&
                    Number.isFinite(pos.coords.accuracy) &&
                    pos.coords.accuracy > 0
                        ? pos.coords.accuracy
                        : null;
                const current: PreviewGpsResult = { lat, lng, accuracyM: accuracy };
                if (
                    !best ||
                    (current.accuracyM != null &&
                        (best.accuracyM == null || current.accuracyM < best.accuracyM))
                ) {
                    best = current;
                }
                if (current.accuracyM != null && current.accuracyM <= PREVIEW_TARGET_ACCURACY_M) {
                    resolve(current);
                    return;
                }
            }
            if (best && best.accuracyM != null && best.accuracyM <= PREVIEW_TARGET_ACCURACY_M) {
                resolve(best);
                return;
            }
            reject(
                new Error(
                    'Could not get reliable current location. Move to open sky, enable precise location, and try again.',
                ),
            );
        } catch (err: any) {
            if (err?.code === 1) {
                reject(
                    new Error(
                        'Location permission denied. Allow location for this site in your browser settings, then try again.',
                    ),
                );
                return;
            }
            if (err?.code === 2) {
                reject(new Error('Location unavailable. Check GPS/network and try again.'));
                return;
            }
            if (err?.code === 3) {
                reject(new Error('Location request timed out. Please try again.'));
                return;
            }
            reject(
                new Error(
                    'Could not get current location. Enable location services and try again.',
                ),
            );
        }
    });
}
