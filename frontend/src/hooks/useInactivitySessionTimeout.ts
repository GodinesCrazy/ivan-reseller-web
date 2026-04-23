import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@stores/authStore';
import {
  getSessionActivitySnapshot,
  markSessionActivity,
  subscribeToSessionActivity,
} from '@/utils/sessionActivity';

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'scroll',
  'touchstart',
  'focus',
];

export function useInactivitySessionTimeout() {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuthStore();
  const timingOutRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || location.pathname === '/login') {
      return;
    }

    let lastRecordedActivity = 0;
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastRecordedActivity < 1000) {
        return;
      }
      lastRecordedActivity = now;
      markSessionActivity();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        recordActivity();
      }
    };

    const checkInactivity = async () => {
      if (timingOutRef.current) {
        return;
      }

      const snapshot = getSessionActivitySnapshot();
      const idleForMs = Date.now() - snapshot.lastActivityAt;
      if (snapshot.pendingRequestCount > 0 || idleForMs < snapshot.idleTimeoutMs) {
        return;
      }

      timingOutRef.current = true;
      try {
        await logout();
      } catch {
        useAuthStore.getState().clearSession();
      }

      toast.error('La sesion se cerro por inactividad.');
      const returnUrl = encodeURIComponent(location.pathname + location.search);
      window.location.href = `/login?returnUrl=${returnUrl}`;
    };

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsubscribe = subscribeToSessionActivity(() => {
      if (timingOutRef.current) {
        timingOutRef.current = false;
      }
    });
    const intervalId = window.setInterval(() => {
      void checkInactivity();
    }, 30000);

    recordActivity();

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [isAuthenticated, location.pathname, location.search, logout]);
}
