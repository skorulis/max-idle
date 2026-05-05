import type { AppConfig } from "../src/types.js";

/** Default backend config for integration tests (matches historical api.test.ts fixtures). */
export function createTestAppConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    port: 3000,
    isProduction: false,
    databaseUrl: "postgres://unused",
    jwtSecret: "test-secret",
    amplitudeApiKey: "test-amplitude-api-key",
    corsOrigin: "http://localhost:5173",
    betterAuthSecret: "test-secret-test-secret-test-secret-32",
    betterAuthUrl: "http://localhost:3000",
    googleClientId: undefined,
    googleClientSecret: undefined,
    appleClientId: undefined,
    appleClientSecret: undefined,
    ...overrides
  };
}
