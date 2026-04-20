import { randomBytes } from "node:crypto";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export const ANONYMOUS_USERNAME_PREFIX = "anonymous";

export function generateAnonymousUsername(): string {
  return `${ANONYMOUS_USERNAME_PREFIX}-${randomBytes(4).toString("hex")}`;
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
