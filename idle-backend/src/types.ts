export type AuthClaims = {
  sub: string;
  isAnonymous: boolean;
  authUserId?: string;
};

export type AppConfig = {
  port: number;
  isProduction: boolean;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin: string;
  betterAuthSecret: string;
  betterAuthUrl: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleClientSecret?: string;
};
