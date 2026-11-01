// Confirm dialogs and toast messages, shared by every page.
//
// Usage inside a component:
//   const { confirm, toast } = useFeedback();
//   const ok = await confirm({ title: "Delete server?", message: "...", confirmLabel: "Delete", danger: true });
//   if (ok) { ...; toast("Server is being deleted"); }
//
// confirm() can also ask for a text (for example a reject reason):
//   const result = await confirm({ ..., input: { label: "Reason", required: true } });
//   if (result) { use result.text }

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Ask the user to type something (a comment or reason).
  // mustMatch: the confirm button stays disabled until the text equals this (e.g. a hostname).
  input?: { label: string; placeholder?: string; required?: boolean; mustMatch?: string };
}

// false = cancelled. Otherwise the text the user typed ("" when there was no input).
type ConfirmResult = false | { text: string };

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface FeedbackValue {
  confirm: (options: ConfirmOptions) => Promise<ConfirmResult>;
  toast: (text: string, kind?: ToastKind) => void;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function useFeedback(): FeedbackValue {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error("useFeedback must be used inside <FeedbackProvider>");
  }
  return value;
}

interface OpenDialog {
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(1);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<ConfirmResult>((resolve) => {
      setDialog({ options, resolve });
    });
  }, []);

  const toast = useCallback((text: string, kind: ToastKind = "success") => {
    const id = nextToastId.current++;
    setToasts((current) => [...current, { id, kind, text }]);
    // Hide it again after a few seconds.
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  function close(result: ConfirmResult) {
    if (dialog) {
      dialog.resolve(result);
    }
    setDialog(null);
  }

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}
      {dialog && <ConfirmDialog options={dialog.options} onClose={close} />}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast toast-" + t.kind}>
            <span className="toast-icon" aria-hidden="true">
              {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
            </span>
            <span>{t.text}</span>
            <button
              className="toast-close"
              aria-label="Close"
              onClick={() => setToasts((current) => current.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ options, onClose }: { options: ConfirmOptions; onClose: (result: ConfirmResult) => void }) {
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const inputBox = useRef<HTMLTextAreaElement>(null);

  const mustMatch = options.input?.mustMatch;
  const needsText = options.input?.required === true || mustMatch !== undefined;
  const missingText = needsText && text.trim() === "";
  const wrongText = mustMatch !== undefined && text.trim() !== mustMatch;

  // Keep the latest onClose in a ref so the effect below runs only once.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the text box (or the confirm button) and let Escape cancel.
  useEffect(() => {
    if (inputBox.current) {
      inputBox.current.focus();
    } else if (confirmButton.current) {
      confirmButton.current.focus();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    setTouched(true);
    if (missingText || wrongText) {
      return;
    }
    onClose({ text: text.trim() });
  }

  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div
        className={"card modal confirm" + (options.danger ? " confirm-danger" : "")}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-head">
          <span className="confirm-icon" aria-hidden="true">
            {options.danger ? "!" : "?"}
          </span>
          <h2 id="confirm-title">{options.title}</h2>
        </div>
        {options.message && <div className="confirm-message">{options.message}</div>}

        {options.input && (
          <label>
            {options.input.label}
            {!needsText && <span className="muted small"> (optional)</span>}
            <textarea
              ref={inputBox}
              rows={mustMatch !== undefined ? 1 : 3}
              value={text}
              spellCheck={mustMatch === undefined}
              placeholder={options.input.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // A one-line answer (like a hostname) is sent with Enter.
                if (mustMatch !== undefined && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className={touched && missingText ? "invalid" : ""}
            />
            {touched && missingText && <small className="field-error">Please fill this in.</small>}
          </label>
        )}

        <div className="actions">
          <button type="button" className="secondary" onClick={() => onClose(false)}>
            {options.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            ref={confirmButton}
            className={options.danger ? "danger" : ""}
            disabled={wrongText}
            onClick={submit}
          >
            {options.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
