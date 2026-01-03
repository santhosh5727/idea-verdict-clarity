import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

// Session timeout configuration
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const WARNING_BEFORE_TIMEOUT_MS = 2 * 60 * 1000; // Show warning 2 minutes before timeout

// Activity events to track
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

interface UseSessionTimeoutReturn {
  remainingTime: number;
  isWarningVisible: boolean;
  extendSession: () => void;
}

export const useSessionTimeout = (): UseSessionTimeoutReturn => {
  const { user, signOut } = useAuth();
  const [remainingTime, setRemainingTime] = useState(SESSION_TIMEOUT_MS);
  const [isWarningVisible, setIsWarningVisible] = useState(false);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Clear all timers
  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Handle session expiry
  const handleSessionExpiry = useCallback(async () => {
    clearAllTimers();
    setIsWarningVisible(false);
    
    toast.error("Session expired due to inactivity. Please log in again.");
    await signOut();
  }, [signOut, clearAllTimers]);

  // Show warning before timeout
  const showWarning = useCallback(() => {
    setIsWarningVisible(true);
    setRemainingTime(WARNING_BEFORE_TIMEOUT_MS);
    
    // Start countdown
    countdownRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          return 0;
        }
        return newTime;
      });
    }, 1000);

    toast.warning(
      "Your session will expire soon due to inactivity. Move your mouse or press a key to stay logged in.",
      { duration: 10000 }
    );
  }, []);

  // Reset activity timer
  const resetActivityTimer = useCallback(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    clearAllTimers();
    setIsWarningVisible(false);
    setRemainingTime(SESSION_TIMEOUT_MS);

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      showWarning();
    }, SESSION_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS);

    // Set session expiry timeout
    timeoutRef.current = setTimeout(() => {
      handleSessionExpiry();
    }, SESSION_TIMEOUT_MS);
  }, [user, clearAllTimers, showWarning, handleSessionExpiry]);

  // Extend session (called when user interacts during warning)
  const extendSession = useCallback(() => {
    if (isWarningVisible) {
      toast.success("Session extended!");
    }
    resetActivityTimer();
  }, [isWarningVisible, resetActivityTimer]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    // Throttle activity detection to prevent excessive timer resets
    const now = Date.now();
    if (now - lastActivityRef.current > 1000) {
      resetActivityTimer();
    }
  }, [resetActivityTimer]);

  // Set up activity listeners
  useEffect(() => {
    if (!user) {
      clearAllTimers();
      setIsWarningVisible(false);
      return;
    }

    // Initialize timer
    resetActivityTimer();

    // Add activity listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Handle visibility change (tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && user) {
        // Check if session should have expired while tab was hidden
        const inactiveTime = Date.now() - lastActivityRef.current;
        if (inactiveTime >= SESSION_TIMEOUT_MS) {
          handleSessionExpiry();
        } else if (inactiveTime >= SESSION_TIMEOUT_MS - WARNING_BEFORE_TIMEOUT_MS) {
          showWarning();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearAllTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, resetActivityTimer, handleActivity, clearAllTimers, handleSessionExpiry, showWarning]);

  return {
    remainingTime,
    isWarningVisible,
    extendSession,
  };
};
