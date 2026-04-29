import { useEffect, useMemo, useState } from "react";

const FALLBACK_MESSAGE = "The message board is taking a snack break.";
const WELCOME_MESSAGE = "Welcome to the world of competitive waiting.";
const HUMOROUS_MESSAGES = [
  "Your productivity has entered low-power mode.",
  "Another second has passed without incident",
  "Your idle engine is purring like a very relaxed cat.",
  "If you stare at the counter it will stare back.",
  "Make sure to keep hydrated, you could be waiting a while.",
  "Doing nothing remains unexpectedly effective.",
  "Competitive idling isn't for the faint of heart.",
  "What will you do with all of that time?",
  "Your goal is simple.  Be idle for longer than anyone else.",
  "To catch up, try doing nothing faster.",
  "If you keep going, you’ll waste a full day in only 24 hours.",
  "If you're wondering what the point of this is, you're not alone.",
  "Who has time? But then if we do not ever take time, how can we ever have time? -Merovingian",
];

function getRandomMessageIndex(excludeIndex?: number): number {
  if (HUMOROUS_MESSAGES.length === 0) {
    return -1;
  }
  if (HUMOROUS_MESSAGES.length === 1) {
    return 0;
  }
  let nextIndex = Math.floor(Math.random() * HUMOROUS_MESSAGES.length);
  while (nextIndex === excludeIndex) {
    nextIndex = Math.floor(Math.random() * HUMOROUS_MESSAGES.length);
  }
  return nextIndex;
}

function getMessageFromIndex(index: number): string {
  return HUMOROUS_MESSAGES[index] ?? FALLBACK_MESSAGE;
}

export function useBottomBulletinMessage(isAuthenticated: boolean) {
  const [messageCardRandomIndex, setMessageCardRandomIndex] = useState(() => getRandomMessageIndex());
  const [displayedMessage, setDisplayedMessage] = useState(WELCOME_MESSAGE);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [messageFadeStage, setMessageFadeStage] = useState<"idle" | "fading-out" | "fading-in">("idle");

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      setMessageCardRandomIndex((previousIndex) => getRandomMessageIndex(previousIndex));
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  const activeMessageCardText = useMemo(
    () => (isAuthenticated ? getMessageFromIndex(messageCardRandomIndex) : WELCOME_MESSAGE),
    [isAuthenticated, messageCardRandomIndex]
  );

  useEffect(() => {
    if (activeMessageCardText === displayedMessage || activeMessageCardText === pendingMessage) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingMessage(activeMessageCardText);
      setMessageFadeStage("fading-out");
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeMessageCardText, displayedMessage, pendingMessage]);

  useEffect(() => {
    if (messageFadeStage !== "fading-out") {
      return;
    }
    const timer = window.setTimeout(() => {
      setDisplayedMessage(pendingMessage ?? activeMessageCardText);
      setMessageFadeStage("fading-in");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage, pendingMessage, activeMessageCardText]);

  useEffect(() => {
    if (messageFadeStage !== "fading-in") {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingMessage(null);
      setMessageFadeStage("idle");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage]);

  return {
    displayedMessage,
    isFadingOutMessage: messageFadeStage === "fading-out",
    isFadingInMessage: messageFadeStage === "fading-in",
  };
}
