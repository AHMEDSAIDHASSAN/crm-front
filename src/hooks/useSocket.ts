import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

type NotificationPayload = {
  id: string;
  notificationType: string;
  title: string;
  message: string | null;
  isRead: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
};

/**
 * Subscribes to real-time `notification` events from Nest (NotificationsGateway).
 * Connects through the Vite dev proxy at `/socket.io` → same origin as the SPA.
 * Reconnects when `userId` changes (login / session switch); disconnects when logged out.
 */
export function useSocket(
  onNotification?: (payload: NotificationPayload) => void,
  userId?: string | number | null,
) {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onNotification);
  callbackRef.current = onNotification;

  useEffect(() => {
    const token = localStorage.getItem('token');
    const uid = userId ?? null;
    if (!token || uid === '' || uid === null || uid === undefined) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });

    socketRef.current = socket;

    const onPayload = (payload: NotificationPayload) => {
      callbackRef.current?.(payload);
    };

    socket.on('notification', onPayload);

    socket.on('connect_error', (err: Error) => {
      console.warn('[Socket] connect_error:', err.message);
    });

    return () => {
      socket.off('notification', onPayload);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    const token = localStorage.getItem('token');
    const uid = userId ?? null;
    if (!token || uid === null || uid === undefined || uid === '') return;

    const socket = io({
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;
    socket.on('notification', (payload: NotificationPayload) => {
      callbackRef.current?.(payload);
    });
  }, [userId]);

  return { socketRef, reconnect };
}
