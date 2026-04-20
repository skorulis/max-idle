export type AuthClaims = {
  sub: string;
  isAnonymous: boolean;
};

export type AppConfig = {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
};
