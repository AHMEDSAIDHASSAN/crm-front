/**
 * Accurate GPS sampling for meeting / preview check-in & check-out.
 * Collects multiple high-accuracy readings and returns the best (lowest accuracy meters).
 */
const MAX_WAIT_MS = 15_000;
const TARGET_ACCURACY_M = 35;
const MAX_ACCEPTED_ACCURACY_M = 120;
const EARLY_RETURN_AFTER_FIRST_MS = 2500;
/** Reject only clearly stale cached fixes (browser timestamps older than this vs now) */
const MAX_SAMPLE_AGE_MS = 60_000;
/** When the browser omits accuracy or reports 0, still keep the fix but rank it after known-accuracy reads */
const UNKNOWN_ACCURACY_M = 10_000;

export function coordsToMeetingString(lat: number, lng: number): string {
    return `${lat}, ${lng}`;
}

export function getMeetingGpsPosition(): Promise<GeolocationPosition> {
    if (!navigator.geolocation) {
        return Promise.reject({ code: 2, message: 'Geolocation not supported' });
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        let watchId: number | null = null;
        let timer: number | null = null;
        let bestPos: GeolocationPosition | null = null;
        let bestAcc = Number.POSITIVE_INFINITY;
        let freshSamples = 0;
        let earlyReturnTimer: number | null = null;

        const finish = (forceReject = false) => {
            if (settled) return;
            settled = true;
            if (timer != null) window.clearTimeout(timer);
            if (earlyReturnTimer != null) window.clearTimeout(earlyReturnTimer);
            if (watchId != null) navigator.geolocation.clearWatch(watchId);

            if (!forceReject && bestPos && Number.isFinite(bestAcc) && bestAcc <= MAX_ACCEPTED_ACCURACY_M) {
                resolve(bestPos);
                return;
            }

            if (bestPos && !forceReject) {
                // Still return best available reading instead of hard-failing.
                resolve(bestPos);
                return;
            }

            reject({
                code: 2,
                message:
                    'Could not get reliable current location. Move to an open area and ensure precise location is enabled.',
            });
        };

        const consider = (pos: GeolocationPosition) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accRaw = pos.coords.accuracy;
            const accM =
                Number.isFinite(accRaw) && accRaw > 0 ? accRaw : UNKNOWN_ACCURACY_M;
            const sampleAgeMs = Date.now() - pos.timestamp;
            if (Number.isFinite(sampleAgeMs) && sampleAgeMs > MAX_SAMPLE_AGE_MS) return;
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

            freshSamples += 1;
            if (accM < bestAcc) {
                bestAcc = accM;
                bestPos = pos;
            }
            if (accM <= TARGET_ACCURACY_M) finish();
            if (freshSamples === 1 && earlyReturnTimer == null) {
                earlyReturnTimer = window.setTimeout(() => {
                    if (bestPos) finish();
                }, EARLY_RETURN_AFTER_FIRST_MS);
            }
        };

        const onError = (err: GeolocationPositionError) => {
            // Permission denied should fail immediately.
            if (err.code === 1) {
                if (settled) return;
                settled = true;
                if (timer != null) window.clearTimeout(timer);
                if (watchId != null) navigator.geolocation.clearWatch(watchId);
                reject(err);
                return;
            }
            // For unavailable/timeout keep waiting for watch samples.
        };

        watchId = navigator.geolocation.watchPosition(consider, onError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: MAX_WAIT_MS,
        });

        navigator.geolocation.getCurrentPosition(consider, onError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: MAX_WAIT_MS,
        });

        timer = window.setTimeout(() => finish(), MAX_WAIT_MS);
    });
}
