import { useEffect, useMemo, useRef, useState } from "react";
import {
  BLACKHOLE_FEED_SECONDS_PER_TAP,
  getBlackholeFeedSeconds,
  getBlackHoleTimeDilation
} from "@maxidle/shared/blackHole";

const FEED_DEBOUNCE_MS = 400;

type UseBlackHoleFeedOptions = {
  blackholeTime: number;
  onFeedTaps: (taps: number) => Promise<void>;
};

export function useBlackHoleFeed({ blackholeTime, onFeedTaps }: UseBlackHoleFeedOptions) {
  const [optimisticSeconds, setOptimisticSeconds] = useState(0);
  const pendingTapsRef = useRef(0);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const onFeedTapsRef = useRef(onFeedTaps);

  useEffect(() => {
    onFeedTapsRef.current = onFeedTaps;
  }, [onFeedTaps]);

  const displayBlackholeTime = blackholeTime + optimisticSeconds;
  const timeDilation = useMemo(() => getBlackHoleTimeDilation(displayBlackholeTime), [displayBlackholeTime]);

  const scheduleFlush = () => {
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = setTimeout(() => {
      flushTimeoutRef.current = null;
      void flushPendingTaps();
    }, FEED_DEBOUNCE_MS);
  };

  const flushPendingTaps = async () => {
    if (inFlightRef.current) {
      return;
    }
    const taps = pendingTapsRef.current;
    if (taps <= 0) {
      return;
    }
    pendingTapsRef.current = 0;
    inFlightRef.current = true;
    const secondsFed = getBlackholeFeedSeconds(taps);
    try {
      await onFeedTapsRef.current(taps);
      setOptimisticSeconds((seconds) => Math.max(0, seconds - secondsFed));
    } catch {
      pendingTapsRef.current += taps;
      setOptimisticSeconds((seconds) => Math.max(0, seconds - secondsFed));
    } finally {
      inFlightRef.current = false;
      if (pendingTapsRef.current > 0) {
        scheduleFlush();
      }
    }
  };

  useEffect(() => {
    return () => {
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, []);

  const registerTap = () => {
    pendingTapsRef.current += 1;
    setOptimisticSeconds((seconds) => seconds + BLACKHOLE_FEED_SECONDS_PER_TAP);
    scheduleFlush();
  };

  return {
    displayBlackholeTime,
    timeDilation,
    registerTap
  };
}
