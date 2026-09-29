"use client";

import { useEffect, useRef, useCallback } from "react";

interface AlertEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  confidence?: number;
  caseNumber?: string;
}

export function useAlertStream(onAlert?: (alert: AlertEvent) => void) {
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const connect = useCallback(() => {
    const es = new EventSource("/api/alerts/stream");

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected" || data.type === "heartbeat") return;
        if (data.id && data.title) {
          onAlertRef.current?.(data as AlertEvent);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return es;
  }, []);

  useEffect(() => {
    const es = connect();
    return () => es.close();
  }, [connect]);
}
