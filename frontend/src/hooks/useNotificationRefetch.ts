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

    socket.on('connect', () => {
      socket.emit('join_room', `user_${user.id}`);
    });

    socket.on('notification', (payload: { type?: string }) => {
      const type = payload?.type as NotificationTypeForRefetch | undefined;
      if (!type) return;
      const fn = handlersRef.current[type];
      if (typeof fn === 'function') {
        void Promise.resolve(fn()).catch(() => {});
      }
    });

    return () => {
      socket.close();
    };
  }, [enabled, token, user?.id]);
}
