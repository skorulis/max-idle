import { useEffect, useMemo, useRef, useState } from "react";
import type { ResearchState } from "@maxidle/shared/research";
import {
  getBlackholeDailyFeedLimit,
  getBlackholeFeedSeconds,
  getBlackholeFeedSecondsPerTap,
  getBlackHoleTimeDilation
} from "@maxidle/shared/blackHole";
import { toast } from "../gameToast";

const FEED_DEBOUNCE_MS = 400;

type UseBlackHoleFeedOptions = {
  blackholeTime: number;
  research: ResearchState;
  blackholeFeedsRemainingToday: number;
  onFeedTaps: (taps: number) => Promise<void>;
};

export function useBlackHoleFeed({
  blackholeTime,
  research,
  blackholeFeedsRemainingToday,
  onFeedTaps
}: UseBlackHoleFeedOptions) {
  const blackholeDailyFeedLimit = useMemo(() => getBlackholeDailyFeedLimit(research), [research]);
  const feedSecondsPerTap = useMemo(() => getBlackholeFeedSecondsPerTap(research), [research]);
  const [optimisticSeconds, setOptimisticSeconds] = useState(0);
  const [pendingTapCount, setPendingTapCount] = useState(0);
  const pendingTapsRef = useRef(0);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const onFeedTapsRef = useRef(onFeedTaps);

  useEffect(() => {
    onFeedTapsRef.current = onFeedTaps;
  }, [onFeedTaps]);

  const effectiveFeedsRemaining = Math.max(0, blackholeFeedsRemainingToday - pendingTapCount);
  const displayBlackholeTime = blackholeTime + optimisticSeconds;
  const timeDilation = useMemo(() => getBlackHoleTimeDilation(displayBlackholeTime), [displayBlackholeTime]);
  const atDailyLimit = effectiveFeedsRemaining <= 0;

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
    setPendingTapCount(0);
    inFlightRef.current = true;
    const secondsFed = getBlackholeFeedSeconds(taps, research);
    try {
      await onFeedTapsRef.current(taps);
      setOptimisticSeconds((seconds) => Math.max(0, seconds - secondsFed));
    } catch (error) {
      pendingTapsRef.current += taps;
      setPendingTapCount((count) => count + taps);
      setOptimisticSeconds((seconds) => Math.max(0, seconds - secondsFed));
      if (error instanceof Error && error.message === "BLACKHOLE_FEED_DAILY_LIMIT_EXCEEDED") {
        pendingTapsRef.current = 0;
        setPendingTapCount(0);
        toast.warning(`Daily feed limit reached (${blackholeDailyFeedLimit} per UTC day).`);
      }
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
    if (blackholeFeedsRemainingToday - pendingTapsRef.current <= 0) {
      toast.warning(`Daily feed limit reached (${blackholeDailyFeedLimit} per UTC day).`);
      return;
    }

    pendingTapsRef.current += 1;
    setPendingTapCount((count) => count + 1);
    setOptimisticSeconds((seconds) => seconds + feedSecondsPerTap);
    scheduleFlush();
  };

  return {
    displayBlackholeTime,
    timeDilation,
    effectiveFeedsRemaining,
    atDailyLimit,
    registerTap
  };
}
