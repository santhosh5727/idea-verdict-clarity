/**
 * Development-only logging utility
 * In production, these logs are suppressed to prevent information leakage
 */

export const logError = (message: string, error?: unknown) => {
  if (import.meta.env.DEV) {
    console.error(message, error);
  }
  // In production, you could send to a monitoring service here
};

export const logWarn = (message: string, data?: unknown) => {
  if (import.meta.env.DEV) {
    console.warn(message, data);
  }
};

export const logInfo = (message: string, data?: unknown) => {
  if (import.meta.env.DEV) {
    console.log(message, data);
  }
};
