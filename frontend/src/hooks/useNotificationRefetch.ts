/**
 * useNotificationRefetch - Dispara refetch cuando llegan notificaciones por Socket.IO
 * Complementa useLiveData: el polling mantiene datos frescos; este hook refetcha
 * inmediatamente cuando ocurren eventos (venta, producto publicado, etc.)
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { getSocketOptions } from '../config/runtime';

export type NotificationTypeForRefetch =
  | 'SALE_CREATED'
  | 'PRODUCT_PUBLISHED'
  | 'PRODUCT_SCRAPED'
  | 'INVENTORY_UPDATED'
  | 'JOB_STARTED'
  | 'JOB_PROGRESS'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'COMMISSION_CALCULATED'
  | 'PAYOUT_PROCESSED'
  | 'SYSTEM_ALERT'
  | 'USER_ACTION';

export interface UseNotificationRefetchOptions {
  /** Mapa tipo de notificación -> función refetch a ejecutar */
  handlers: Partial<Record<NotificationTypeForRefetch, () => void | Promise<void>>>;
  /** Si false, no se conecta al socket */
  enabled?: boolean;
}

const NOTIFICATION_REFETCH_DEBOUNCE_MS = 450;

export function useNotificationRefetch({
  handlers,
  enabled = true,
}: UseNotificationRefetchOptions): void {
  const { token, user } = useAuthStore();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !token || !user) return;

    const types = Object.keys(handlersRef.current).filter(
      (k) => typeof handlersRef.current[k as NotificationTypeForRefetch] === 'function'
    );
    if (types.length === 0) return;

    const { url, path } = getSocketOptions();
    const socket = io(url, {
      path,
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 20000,
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const typesInWindow = new Set<NotificationTypeForRefetch>();

    const flushDebounced = () => {
      debounceTimer = null;
      const fns = new Set<() => void | Promise<void>>();
      for (const t of typesInWindow) {
        const fn = handlersRef.current[t];
        if (typeof fn === 'function') fns.add(fn);
      }
      typesInWindow.clear();
      for (const fn of fns) {
        void Promise.resolve(fn()).catch(() => {});
      }
    };

    socket.on('connect', () => {
      socket.emit('join_room', `user_${user.id}`);
    });

    socket.on('notification', (payload: { type?: string }) => {
      const type = payload?.type as NotificationTypeForRefetch | undefined;
      if (!type || typeof handlersRef.current[type] !== 'function') return;
      typesInWindow.add(type);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flushDebounced, NOTIFICATION_REFETCH_DEBOUNCE_MS);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      typesInWindow.clear();
      socket.close();
    };
  }, [enabled, token, user?.id]);
}
