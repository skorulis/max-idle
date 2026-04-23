export const AUTH_PASSWORD_MIN_LENGTH = 1;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email ?? "").trim();
}

export function isValidEmail(email) {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= AUTH_PASSWORD_MIN_LENGTH;
}

export function validateEmailPasswordInput(email, password) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return {
      isValid: false,
      email: normalizedEmail,
      error: "Please enter a valid email address."
    };
  }
  if (!isValidPassword(password)) {
    return {
      isValid: false,
      email: normalizedEmail,
      error: "Please enter a password."
    };
  }
  return {
    isValid: true,
    email: normalizedEmail,
    error: null
  };
}
