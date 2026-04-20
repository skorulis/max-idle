import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./auth";

export function requireAuth(jwtSecret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    try {
      req.auth = verifyToken(token, jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  };
}
