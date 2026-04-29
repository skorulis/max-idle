import { useEffect } from "react";
import { toast } from "../gameToast";

const RETURN_LAST_SEEN_AT_MS_KEY = "max-idle-return-last-seen-at-ms";
const RETURN_SESSION_MARKER_KEY = "max-idle-return-session-marker";
const RETURN_THRESHOLD_MS = 60 * 60 * 1000;

const RETURN_MESSAGES = [
  "You've come back. This is a little unexpected",
  "I see you've come back to stare at the screen some more",
  "I hope you had fun in the real world",
];

export function useReturnAfterAwayMessage() {
  useEffect(() => {
    const now = Date.now();
    const hasSessionMarker = sessionStorage.getItem(RETURN_SESSION_MARKER_KEY) === "1";
    const storedLastSeenAtMs = Number(localStorage.getItem(RETURN_LAST_SEEN_AT_MS_KEY));
    const hasStoredLastSeenAtMs = Number.isFinite(storedLastSeenAtMs) && storedLastSeenAtMs > 0;

    if (!hasSessionMarker && hasStoredLastSeenAtMs && now - storedLastSeenAtMs > RETURN_THRESHOLD_MS) {
      const randomMessage = RETURN_MESSAGES[Math.floor(Math.random() * RETURN_MESSAGES.length)];
      toast.success(randomMessage);
    }

    const persistLastSeenAt = () => {
      localStorage.setItem(RETURN_LAST_SEEN_AT_MS_KEY, String(Date.now()));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistLastSeenAt();
      }
    };

    sessionStorage.setItem(RETURN_SESSION_MARKER_KEY, "1");
    persistLastSeenAt();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistLastSeenAt);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistLastSeenAt);
    };
  }, []);
}
