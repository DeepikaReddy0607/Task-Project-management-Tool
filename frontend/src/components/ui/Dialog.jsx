import { useEffect } from "react";
import { FiX } from "react-icons/fi";

function Dialog({ children, onClose, title, wide = false, topmost = false, isOpen = true }) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      className={`fixed inset-0 ${
        topmost ? "z-[80]" : "z-[70]"
      } flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-3 backdrop-blur-sm sm:items-center sm:p-5`}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:max-h-[calc(100vh-2.5rem)] sm:p-7 ${
          wide ? "max-w-6xl" : "max-w-xl"
        }`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="dialog-title"
            className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
          >
            <FiX size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export default Dialog;
