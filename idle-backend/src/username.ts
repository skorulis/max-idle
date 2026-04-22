import { randomInt } from "node:crypto";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

const ADJECTIVES = [
  "agile",
  "bad",
  "bored",
  "brave",
  "bright",
  "brisk",
  "calm",
  "chill",
  "choppy",
  "clever",
  "dense",
  "dim",
  "dumb",
  "eager",
  "fancy",
  "fast",
  "fit",
  "fresh",
  "fun",
  "glad",
  "gloomy",
  "grand",
  "hot",
  "idle",
  "jolly",
  "keen",
  "kind",
  "lazy",
  "lucky",
  "merry",
  "mint",
  "neat",
  "nifty",
  "peppy",
  "plush",
  "proud",
  "quick",
  "rapid",
  "sad",
  "sexy",
  "silly",
  "sly",
  "snug",
  "sunny",
  "swift",
  "tidy",
  "tired",
  "torpid",
  "ugly",
  "weird",
  "wet",
  "wild",
  "wise",
  "witty",
  "zesty",
] as const;

const NOUNS = [
  "bear",
  "bird",
  "bloom",
  "brick",
  "car",
  "cat",
  "cloud",
  "cow",
  "crab",
  "comet",
  "crest",
  "dawn",
  "day",
  "deer",
  "dirt",
  "dog",
  "dream",
  "drift",
  "dust",
  "flame",
  "fjord",
  "frost",
  "grove",
  "leaf",
  "moose",
  "nova",
  "otter",
  "pearl",
  "pine",
  "pixel",
  "plume",
  "quill",
  "rat",
  "river",
  "spark",
  "sprout",
  "stone",
  "sun",
  "tea",
  "tree",
  "wave",
  "whale",
  "wren",
] as const;

export function generateAnonymousUsername(): string {
  const adjective = ADJECTIVES[randomInt(ADJECTIVES.length)];
  const noun = NOUNS[randomInt(NOUNS.length)];
  const suffix = randomInt(1000).toString().padStart(3, "0");
  return `${adjective}-${noun}-${suffix}`;
}

export function isUsernameTakenError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === "23505" && pgError.constraint === "users_username_lower_unique_idx";
}

export function isValidUsername(username: string): boolean {
  if (username.length < 3 || username.length > 32) {
    return false;
  }
  return USERNAME_PATTERN.test(username);
}
