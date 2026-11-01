// Short messages in the corner of the screen: "Quota saved", or what went wrong.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface ToastItem {
  id: number;
  kind: "success" | "error";
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastItem["kind"], text: string) => {
      const id = nextId.current;
      nextId.current = id + 1;
      setToasts((current) => [...current, { id, kind, text }]);
      // Errors stay longer, so there is time to read them.
      window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
    },
    [dismiss]
  );

  const [toastApi] = useState<ToastApi>(() => ({
    success: (text) => show("success", text),
    error: (text) => show("error", text),
  }));

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className={"toast toast-" + toast.kind} key={toast.id}>
            <Icon name={toast.kind === "success" ? "checkCircle" : "alert"} />
            <span>{toast.text}</span>
            <button className="icon-button" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return value;
}
