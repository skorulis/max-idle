export type AuthClaims = {
  sub: string;
  isAnonymous: boolean;
  authUserId?: string;
};

export type AppConfig = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleClientSecret?: string;
};
