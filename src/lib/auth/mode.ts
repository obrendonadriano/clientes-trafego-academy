export function isDevelopmentAuthFallbackEnabled() {
  return process.env.NODE_ENV !== "production";
}
