export const AUTH_COOKIE_NAME = "auth";

export function isAuthenticated(value: string | undefined): boolean {
  return value === "1";
}