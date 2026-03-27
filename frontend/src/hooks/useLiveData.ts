/**
 * useLiveData - Polling optimizado con Page Visibility API
 * Pausa o ralentiza el polling cuando la pestaña está oculta.
 */

import { useEffect, useRef, useCallback } from 'react';

const HIDDEN_INTERVAL_MS = 60000; // 60s cuando la pestaña está oculta

export interface UseLiveDataOptions {
  /** Función que obtiene los datos */
  fetchFn: () => void | Promise<void>;
  /** Intervalo en ms cuando la pestaña está visible */
  intervalMs: number;
  /** Si false, no se ejecuta polling */
  enabled?: boolean;
  /** Si true, pausar completamente cuando la pestaña está oculta (por defecto: usar intervalo largo) */
  pauseWhenHidden?: boolean;
  /**
   * Si true, no dispara fetch al montar (solo intervalo y al volver visible).
   * Útil cuando un useEffect ya hace la carga inicial y evita doble request.
   */
  skipInitialRun?: boolean;
}

export function useLiveData({
  fetchFn,
  intervalMs,
  enabled = true,
  pauseWhenHidden = false,
  skipInitialRun = false,
}: UseLiveDataOptions): void {
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const runFetch = useCallback(() => {
    const fn = fetchFnRef.current;
    if (typeof fn === 'function') {
      void Promise.resolve(fn()).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!enabled || intervalMs < 1000) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const getIntervalMs = (): number => {
      if (typeof document === 'undefined' || !document.hidden) {
        return intervalMs;
      }
      return pauseWhenHidden ? intervalMs : HIDDEN_INTERVAL_MS;
    };

    const schedule = () => {
      if (intervalId) clearInterval(intervalId);
      const ms = getIntervalMs();
      if (pauseWhenHidden && typeof document !== 'undefined' && document.hidden) {
        return;
      }
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden && pauseWhenHidden) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          return;
        }
        runFetch();
      }, ms);
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pauseWhenHidden) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        runFetch();
        schedule();
      }
    };

    if (!skipInitialRun) {
      runFetch();
    }
    schedule();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled, intervalMs, pauseWhenHidden, skipInitialRun, runFetch]);
}
