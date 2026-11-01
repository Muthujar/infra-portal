// The "Are you sure?" popup used before every action that changes something.
//
//   const confirm = useConfirm();
//   const answer = await confirm({ title: "Approve?", confirmLabel: "Approve" });
//   if (answer === null) return;   // cancelled
//
// The answer is the text the person typed, or "" when the popup has no text field.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  // Facts to check before confirming, shown as label / value rows.
  details?: { label: string; value: string }[];
  // A warning shown in a highlighted box, e.g. "This is a production server".
  warning?: string;
  confirmLabel: string;
  danger?: boolean;
  // Ask for a comment or reason.
  input?: { label: string; placeholder?: string; minLength?: number };
  // The person must type this exact text before they can confirm.
  typeToConfirm?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [text, setText] = useState("");
  const resolveRef = useRef<((answer: string | null) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setText("");
      setOptions(next);
    });
  }, []);

  function finish(answer: string | null) {
    if (resolveRef.current) {
      resolveRef.current(answer);
      resolveRef.current = null;
    }
    setOptions(null);
  }

  function isReady(): boolean {
    if (!options) {
      return false;
    }
    if (options.typeToConfirm) {
      return text.trim() === options.typeToConfirm;
    }
    if (options.input && options.input.minLength) {
      return text.trim().length >= options.input.minLength;
    }
    return true;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isReady()) {
      finish(text.trim());
    }
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal title={options.title} onClose={() => finish(null)} alert>
          <form onSubmit={handleSubmit}>
            <div className="modal-head">
              <span className={"modal-icon" + (options.danger ? " modal-icon-danger" : "")}>
                <Icon name={options.danger ? "alert" : "info"} size={20} />
              </span>
              <div>
                <h2>{options.title}</h2>
                {options.message && <p className="muted">{options.message}</p>}
              </div>
            </div>

            {options.details && (
              <dl className="confirm-details">
                {options.details.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {options.warning && <div className="notice notice-warn">{options.warning}</div>}

            {options.input && (
              <label>
                {options.input.label}
                <textarea
                  data-autofocus
                  rows={3}
                  value={text}
                  placeholder={options.input.placeholder}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                />
              </label>
            )}

            {options.typeToConfirm && (
              <label>
                <span>
                  Type <code>{options.typeToConfirm}</code> to confirm
                </span>
                <input
                  data-autofocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}

            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => finish(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className={options.danger ? "danger" : ""}
                disabled={!isReady()}
                data-autofocus={options.danger ? undefined : true}
              >
                {options.confirmLabel}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const value = useContext(ConfirmContext);
  if (!value) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return value;
}
