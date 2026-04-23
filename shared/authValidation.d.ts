export const AUTH_PASSWORD_MIN_LENGTH: number;

export function normalizeEmail(email: unknown): string;
export function isValidEmail(email: unknown): boolean;
export function isValidPassword(password: unknown): boolean;
export function validateEmailPasswordInput(
  email: unknown,
  password: unknown
): {
  isValid: boolean;
  email: string;
  error: string | null;
};
