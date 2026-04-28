import { afterEach, describe, expect, it, vi } from "vitest";
import { enterTournament } from "./api";
import { getTournamentSecondsUntilDraw, toSyncedTournamentState } from "./playerState";

describe("tournament state helpers", () => {
  it("maps tournament response dates into synced ms values", () => {
    const synced = toSyncedTournamentState({
      drawAt: "2026-04-26T00:00:00.000Z",
      isActive: true,
      hasEntered: true,
      playerCount: 12,
      currentRank: 3,
      expectedRewardGems: 4,
      nearbyEntries: [
        {
          rank: 3,
          userId: "00000000-0000-0000-0000-000000000001",
          username: "PlayerOne",
          timeScoreSeconds: 1234,
          isCurrentPlayer: true
        }
      ],
      entry: {
        enteredAt: "2026-04-22T12:00:00.000Z",
        finalRank: null,
        timeScoreSeconds: null,
        gemsAwarded: null,
        finalizedAt: null
      }
    });

    expect(synced.isActive).toBe(true);
    expect(synced.hasEntered).toBe(true);
    expect(synced.playerCount).toBe(12);
    expect(synced.currentRank).toBe(3);
    expect(synced.expectedRewardGems).toBe(4);
    expect(synced.drawAtMs).toBe(Date.parse("2026-04-26T00:00:00.000Z"));
    expect(synced.entry?.enteredAtMs).toBe(Date.parse("2026-04-22T12:00:00.000Z"));
  });

  it("computes remaining tournament draw seconds using ceil and floor-at-zero", () => {
    const drawAtMs = Date.parse("2026-04-26T00:00:00.000Z");
    expect(getTournamentSecondsUntilDraw(drawAtMs, drawAtMs - 1250)).toBe(2);
    expect(getTournamentSecondsUntilDraw(drawAtMs, drawAtMs + 1)).toBe(0);
  });
});

describe("tournament api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps draw-in-progress response to TOURNAMENT_DRAW_IN_PROGRESS error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: "TOURNAMENT_DRAW_IN_PROGRESS" }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    await expect(enterTournament("token")).rejects.toThrowError("TOURNAMENT_DRAW_IN_PROGRESS");
  });
});
