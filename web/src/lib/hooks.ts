import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polls an async loader until `stop` reports the data is final. Backs off from
 * 1.5s to 6s so a long Gemini run does not hammer the API.
 */
export function usePolling<T>(
  loader: () => Promise<T>,
  options: { stop: (value: T) => boolean; enabled?: boolean },
) {
  const { stop, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback(async () => {
    try {
      const value = await loaderRef.current();
      setData(value);
      setError(null);
      return value;
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 1500;

    async function tick() {
      const value = await loaderRef.current().catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error(String(caught)));
        }
        return null;
      });

      if (cancelled) return;

      if (value !== null) {
        setData(value);
        setError(null);

        if (stopRef.current(value)) return;
      }

      delay = Math.min(delay * 1.3, 6000);
      timer = setTimeout(tick, delay);
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  return { data, error, refresh };
}

export type Toast = { id: number; message: string; tone: "info" | "error" | "success" };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      const id = ++counter.current;
      setToasts((current) => [...current, { id, message, tone }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
