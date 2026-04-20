import jwt from "jsonwebtoken";
import type { AuthClaims } from "./types";

const TOKEN_TTL = "365d";

export function signAnonymousToken(userId: string, jwtSecret: string): string {
  const payload: AuthClaims = {
    sub: userId,
    isAnonymous: true
  };

  return jwt.sign(payload, jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string, jwtSecret: string): AuthClaims {
  const decoded = jwt.verify(token, jwtSecret);
  if (!decoded || typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  const sub = decoded.sub;
  const isAnonymous = decoded.isAnonymous;

  if (typeof sub !== "string" || typeof isAnonymous !== "boolean") {
    throw new Error("Invalid auth claims");
  }

  return { sub, isAnonymous };
}
