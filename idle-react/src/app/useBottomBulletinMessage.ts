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
  "You are now officially better at waiting than before. Don't brag too much.",
  "Something exciting is happening. But not in this game.",
  "The system appreciates your continued lack of input.",
  "This is what peak inactivity looks like.",
  "Your absence of action has been noted.",
  "Your commitment to inaction is inspiring.",
  "You could leave. But then who would watch the numbers?",
  "If you keep going, you’ll waste a full day in only 24 hours.",
  "If you're wondering what the point of this is, you're not alone.",
  "The numbers are going up. What else could you want in life.",
  "You can't win this game, but you can be winning, check the leaderboard.",
  "Idle time isn't just for show, you can buy things with it as well.",
];

const QUOTES: ReadonlyArray<{ quote: string; author: string }> = [
  {
    quote: "Who has time? But then if we do not ever take time, how can we ever have time?",
    author: "The Merovingian",
  },
  {
    quote: "Time is a created thing. To say “I don’t have time,” is like saying, “I don’t want to.”",
    author: "Lao Tzu",
  },
  {
    quote: "Time is an illusion",
    author: "Albert Einstein",
  },
  {
    quote: "Time is the only thing that can't be bought or sold.",
    author: "Warren Buffett",
  },
  {
    quote: "It always takes longer than you expect, even when you take Hofstadter's Law into account.",
    author: "Hofstadter's Law",
  },
  {
    quote: "I've been on a calendar, but never on time",
    author: "Marilyn Monroe",
  },
  {
    quote: "The only reason for time is so that everything doesn't happen at once",
    author: "Albert Einstein",
  },
  {
    quote: "The time you think you're missing, misses you too",
    author: "Ymber Delecto",
  }
];

export type BulletinPlain = { kind: "plain"; text: string };
export type BulletinQuote = { kind: "quote"; quote: string; author: string };
export type BulletinContent = BulletinPlain | BulletinQuote;

function plainBulletin(text: string): BulletinPlain {
  return { kind: "plain", text };
}

function totalBulletinSlots(): number {
  return HUMOROUS_MESSAGES.length + QUOTES.length;
}

function bulletinEquals(a: BulletinContent, b: BulletinContent): boolean {
  if (a.kind === "plain" && b.kind === "plain") {
    return a.text === b.text;
  }
  if (a.kind === "quote" && b.kind === "quote") {
    return a.quote === b.quote && a.author === b.author;
  }
  return false;
}

function getRandomSlot(excludeSlot?: number): number {
  const total = totalBulletinSlots();
  if (total === 0) {
    return -1;
  }
  if (total === 1) {
    return 0;
  }
  let nextSlot = Math.floor(Math.random() * total);
  while (nextSlot === excludeSlot) {
    nextSlot = Math.floor(Math.random() * total);
  }
  return nextSlot;
}

function slotToContent(slot: number): BulletinContent {
  const humorousCount = HUMOROUS_MESSAGES.length;
  const total = totalBulletinSlots();
  if (slot < 0 || slot >= total) {
    return plainBulletin(FALLBACK_MESSAGE);
  }
  if (slot < humorousCount) {
    return plainBulletin(HUMOROUS_MESSAGES[slot] ?? FALLBACK_MESSAGE);
  }
  const quoteEntry = QUOTES[slot - humorousCount];
  if (!quoteEntry) {
    return plainBulletin(FALLBACK_MESSAGE);
  }
  return { kind: "quote", quote: quoteEntry.quote, author: quoteEntry.author };
}

export function useBottomBulletinMessage(isAuthenticated: boolean) {
  const [messageCardRandomSlot, setMessageCardRandomSlot] = useState(() => getRandomSlot());
  const [displayedContent, setDisplayedContent] = useState<BulletinContent>(() => plainBulletin(WELCOME_MESSAGE));
  const [pendingContent, setPendingContent] = useState<BulletinContent | null>(null);
  const [messageFadeStage, setMessageFadeStage] = useState<"idle" | "fading-out" | "fading-in">("idle");

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      setMessageCardRandomSlot((previousSlot) => getRandomSlot(previousSlot));
    }, 20_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  const activeBulletinContent = useMemo(
    () => (isAuthenticated ? slotToContent(messageCardRandomSlot) : plainBulletin(WELCOME_MESSAGE)),
    [isAuthenticated, messageCardRandomSlot]
  );

  useEffect(() => {
    if (bulletinEquals(activeBulletinContent, displayedContent) || (pendingContent && bulletinEquals(activeBulletinContent, pendingContent))) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingContent(activeBulletinContent);
      setMessageFadeStage("fading-out");
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [activeBulletinContent, displayedContent, pendingContent]);

  useEffect(() => {
    if (messageFadeStage !== "fading-out") {
      return;
    }
    const timer = window.setTimeout(() => {
      setDisplayedContent(pendingContent ?? activeBulletinContent);
      setMessageFadeStage("fading-in");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage, pendingContent, activeBulletinContent]);

  useEffect(() => {
    if (messageFadeStage !== "fading-in") {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingContent(null);
      setMessageFadeStage("idle");
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [messageFadeStage]);

  return {
    displayedContent,
    isFadingOutMessage: messageFadeStage === "fading-out",
    isFadingInMessage: messageFadeStage === "fading-in",
  };
}
