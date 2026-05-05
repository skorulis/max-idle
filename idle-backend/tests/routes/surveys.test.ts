import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("survey routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("GET /home includes availableSurvey, POST /surveys/answer grants reward, duplicate returns 409", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    expect(authResponse.status).toBe(201);
    const token = authResponse.body.token as string;

    const home = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(home.status).toBe(200);
    expect(home.body.availableSurvey).not.toBeNull();
    expect(home.body.availableSurvey.id).toBe("1");
    expect(home.body.availableSurvey.reward).toBe(21600);
    expect(home.body.availableSurvey.currencyType).toBe("idle");

    const active = await request(app).get("/surveys/active").set("Authorization", `Bearer ${token}`);
    expect(active.status).toBe(200);
    expect(active.body.survey?.id).toBe("1");
    expect(active.body.survey?.options?.length).toBeGreaterThan(0);

    const idleBefore = home.body.player.idleTime.available as number;

    const answer = await request(app)
      .post("/surveys/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ surveyId: "1", optionId: "UI" });
    expect(answer.status).toBe(200);
    expect(answer.body.idleTime.available).toBe(idleBefore + 21600);

    const dup = await request(app)
      .post("/surveys/answer")
      .set("Authorization", `Bearer ${token}`)
      .send({ surveyId: "1", optionId: "SHOPS" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("SURVEY_ALREADY_ANSWERED");

    const homeAfter = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfter.status).toBe(200);
    expect(homeAfter.body.availableSurvey).toBeNull();
  });
});
