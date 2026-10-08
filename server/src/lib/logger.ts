function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (...args: unknown[]) => console.log(`[INFO] ${timestamp()} -`, ...args),
  warn: (...args: unknown[]) => console.warn(`[WARN] ${timestamp()} -`, ...args),
  error: (...args: unknown[]) => console.error(`[ERROR] ${timestamp()} -`, ...args),
};