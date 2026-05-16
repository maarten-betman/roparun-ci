import { useCallback, useEffect, useRef, useState } from "react";

/** GPS fix shape we expose to the map layer — what we need to render the
 *  blue dot + accuracy circle. Plain lng/lat/accuracy keeps the consumer
 *  decoupled from the browser `GeolocationPosition` quirks. */
export interface UserFix {
  lng: number;
  lat: number;
  accuracy_m: number;
}

export type UserLocationStatus =
  | "idle"
  | "prompting" // permission dialog open
  | "tracking" // watch is active
  | "denied"
  | "unsupported"
  | "error";

export interface UseUserLocation {
  status: UserLocationStatus;
  fix: UserFix | null;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/** Drives `navigator.geolocation.watchPosition` for the public viewer's
 *  "Mijn locatie" button. Strictly client-side — no backend involvement,
 *  no upload queue. Separate from the tracker's `useWatch` because the
 *  viewer use case is "show me a dot on the map", not "register a crew
 *  device". */
export function useUserLocation(): UseUserLocation {
  const [status, setStatus] = useState<UserLocationStatus>("idle");
  const [fix, setFix] = useState<UserFix | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus("idle");
    setFix(null);
    setErrorMessage(null);
  }, []);

  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      setErrorMessage("Deze browser ondersteunt geen locatiebepaling.");
      return;
    }
    setStatus("prompting");
    setErrorMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy_m: pos.coords.accuracy,
        });
        setStatus("tracking");
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
          setErrorMessage("Locatie geweigerd. Sta toe in de browserinstellingen om je positie te zien.");
        } else {
          setStatus("error");
          setErrorMessage(err.message || "Kon locatie niet bepalen.");
        }
        if (watchIdRef.current != null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  const toggle = useCallback(() => {
    if (status === "tracking" || status === "prompting") stop();
    else start();
  }, [status, start, stop]);

  // Clear the watch on unmount.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return { status, fix, errorMessage, start, stop, toggle };
}
