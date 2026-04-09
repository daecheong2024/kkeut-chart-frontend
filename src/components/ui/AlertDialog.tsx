import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { cn } from "../../lib/cn";
import { AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";

type AlertType = "info" | "success" | "warning" | "error";

interface AlertOptions {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
}

interface AlertContextType {
  showAlert: (options: AlertOptions | string) => void;
  showConfirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within AlertProvider");
  return ctx;
}

const ICON_MAP: Record<AlertType, React.ReactNode> = {
  info: <Info className="w-6 h-6 text-[rgb(var(--kkeut-primary))]" />,
  success: <CheckCircle className="w-6 h-6 text-emerald-500" />,
  warning: <AlertCircle className="w-6 h-6 text-amber-500" />,
  error: <XCircle className="w-6 h-6 text-rose-500" />,
};

const ACCENT_MAP: Record<AlertType, string> = {
  info: "border-t-[rgb(var(--kkeut-primary))]",
  success: "border-t-emerald-500",
  warning: "border-t-amber-500",
  error: "border-t-rose-500",
};

type DialogState = {
  visible: boolean;
  type: AlertType;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  mode: "alert" | "confirm";
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const showAlert = useCallback((options: AlertOptions | string) => {
    cancelPendingClose();
    const opts = typeof options === "string" ? { message: options } : options;
    setDialog({ ...opts, type: opts.type || "info", visible: true, mode: "alert" });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    cancelPendingClose();
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ ...opts, type: opts.type || "warning", visible: true, mode: "confirm" });
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (resolveRef.current) {
      resolveRef.current(result);
      resolveRef.current = null;
    }
    setDialog((prev) => (prev ? { ...prev, visible: false } : null));
    cancelPendingClose();
    closeTimeoutRef.current = setTimeout(() => {
      setDialog((current) => (current && current.visible === false ? null : current));
      closeTimeoutRef.current = null;
    }, 150);
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div
          className={cn(
            "fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-150",
            dialog.visible ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => handleClose(false)} />
          <div
            className={cn(
              "relative bg-white rounded-2xl shadow-2xl border border-[rgb(var(--kkeut-border))] border-t-4 w-[360px] max-w-[90vw] overflow-hidden transition-all duration-150",
              dialog.visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
              ACCENT_MAP[dialog.type]
            )}
          >
            <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-2">
              {ICON_MAP[dialog.type]}
              {dialog.title && (
                <h3 className="text-sm font-bold text-[rgb(var(--kkeut-ink))]">
                  {dialog.title}
                </h3>
              )}
              <p className="text-xs text-[rgb(var(--kkeut-muted))] text-center leading-relaxed whitespace-pre-line">
                {dialog.message}
              </p>
            </div>
            <div className="px-6 pb-5 pt-3 flex gap-2">
              {dialog.mode === "confirm" && (
                <button
                  onClick={() => handleClose(false)}
                  className="flex-1 h-9 rounded-xl text-sm font-bold text-[rgb(var(--kkeut-ink))] border border-[rgb(var(--kkeut-border))] bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-2 transition"
                >
                  {dialog.cancelText || "취소"}
                </button>
              )}
              <button
                onClick={() => handleClose(dialog.mode === "confirm" ? true : false)}
                autoFocus
                className="flex-1 h-9 rounded-xl text-sm font-bold text-white bg-[rgb(var(--kkeut-primary))] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--kkeut-primary),.35)] focus:ring-offset-2 transition"
              >
                {dialog.confirmText || "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}
