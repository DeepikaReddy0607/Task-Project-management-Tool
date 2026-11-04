import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Dialog from "../components/ui/Dialog";

describe("Dialog Accessibility & Keyboard Navigation", () => {
  it("renders with role='dialog' and aria-modal='true'", () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Accessible Modal">
        <p>Modal body content</p>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Accessible Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal body content")).toBeInTheDocument();
  });

  it("closes when user presses Escape key", () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Testing Escape key dismissal</p>
      </Dialog>
    );

    expect(handleClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("closes when user clicks the backdrop overlay", () => {
    const handleClose = vi.fn();
    const { container } = render(
      <Dialog isOpen={true} onClose={handleClose} title="Backdrop Test">
        <p>Inside Modal</p>
      </Dialog>
    );

    // The outermost container div is the backdrop overlay
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog content", () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} title="Inside Click Test">
        <button type="button">Inside Button</button>
      </Dialog>
    );

    const insideButton = screen.getByText("Inside Button");
    fireEvent.click(insideButton);

    expect(handleClose).not.toHaveBeenCalled();
  });
});
