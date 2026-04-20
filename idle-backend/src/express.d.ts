import type { AuthClaims } from "./types";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export {};
