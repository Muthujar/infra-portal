// A popup window. Handles the things every popup needs: Esc to close, keeping keyboard
// focus inside, stopping the page behind from scrolling, and returning focus afterwards.

import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

const FOCUSABLE = "a[href], button:not(:disabled), input:not(:disabled), select, textarea";

// Popups can stack (a confirm over the request form), so count how many are open.
let openModals = 0;

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "small" | "large";
  alert?: boolean;
}

export function Modal({ title, onClose, children, size = "small", alert = false }: ModalProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    if (box) {
      const first = box.querySelector<HTMLElement>("[data-autofocus]") || box.querySelector<HTMLElement>(FOCUSABLE);
      if (first) {
        first.focus();
      }
    }

    openModals = openModals + 1;
    document.body.classList.add("modal-open");

    return () => {
      openModals = openModals - 1;
      if (openModals === 0) {
        document.body.classList.remove("modal-open");
      }
      if (previous) {
        previous.focus();
      }
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    // Keep Tab inside the popup.
    if (event.key === "Tab" && boxRef.current) {
      const items = boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) {
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop} onKeyDown={handleKeyDown}>
      <div
        ref={boxRef}
        className={"modal modal-" + size}
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}
