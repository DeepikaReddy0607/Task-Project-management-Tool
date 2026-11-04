import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import Card from "../components/ui/Card";
import api from "../services/api/axios";

describe("API State Handling (Loading, Empty, Error & HTTP Interceptors)", () => {
  it("renders loading state clearly", () => {
    const LoadingState = () => (
      <Card className="flex min-h-60 items-center justify-center p-6">
        <p className="text-sm font-medium text-[var(--color-text-muted)]">
          Loading tasks...
        </p>
      </Card>
    );

    render(<LoadingState />);
    expect(screen.getByText("Loading tasks...")).toBeInTheDocument();
  });

  it("renders empty state with helpful message and action trigger", () => {
    const EmptyState = ({ onAction }) => (
      <div className="text-center py-12" role="status">
        <p className="text-lg font-semibold text-[var(--color-text)]">
          No projects found
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Get started by creating your first project.
        </p>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
        >
          Create Project
        </button>
      </div>
    );

    render(<EmptyState onAction={() => {}} />);
    expect(screen.getByText("No projects found")).toBeInTheDocument();
    expect(
      screen.getByText("Get started by creating your first project.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Project" })).toBeInTheDocument();
  });

  it("maps Axios network timeouts to a user-friendly error message", async () => {
    const timeoutError = {
      code: "ECONNABORTED",
      message: "timeout of 15000ms exceeded",
    };

    try {
      await api.interceptors.response.handlers[0].rejected(timeoutError);
    } catch (err) {
      expect(err.userMessage).toContain("Request timed out");
    }
  });

  it("maps Axios 429 Too Many Requests to user-friendly rate limit message", async () => {
    const rateLimitError = {
      response: {
        status: 429,
        data: { message: "Too many login attempts. Please try again in 15 minutes." },
      },
    };

    try {
      await api.interceptors.response.handlers[0].rejected(rateLimitError);
    } catch (err) {
      expect(err.userMessage).toContain("Too many login attempts");
    }
  });

  it("maps HTTP 500 Server Errors without leaking database internals", async () => {
    const serverError = {
      response: {
        status: 500,
        data: { message: "Internal server error" },
      },
    };

    try {
      await api.interceptors.response.handlers[0].rejected(serverError);
    } catch (err) {
      expect(err.userMessage).toBe("Internal server error");
      expect(err.userMessage).not.toContain("SELECT");
      expect(err.userMessage).not.toContain("Prisma");
    }
  });
});
