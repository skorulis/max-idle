import express from "express";

export function registerRootRoutes(app: express.Express): void {
  app.get("/", (_req, res) => {
    res.json({ web: "https://max-idle.com/" });
  });
}
