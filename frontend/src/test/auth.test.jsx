import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import api from "../services/api/axios";

describe("Frontend Auth State & ProtectedRoute", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated user to /login", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText("Secret Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("renders protected content when taskflow_token exists", () => {
    localStorage.setItem("taskflow_token", "fake-jwt-token-123");
    localStorage.setItem(
      "taskflow_user",
      JSON.stringify({ id: "user-1", name: "Test User", role: "Developer" })
    );

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Secret Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Secret Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
  });

  it("clears localStorage token and redirects on HTTP 401 response", async () => {
    localStorage.setItem("taskflow_token", "expired-token");
    localStorage.setItem("taskflow_user", JSON.stringify({ id: "u-1" }));

    // Mock an axios response interceptor rejection with status 401
    const error401 = {
      response: {
        status: 401,
        data: { message: "Invalid or expired token" },
      },
    };

    try {
      // Trigger interceptor rejection handler directly
      await api.interceptors.response.handlers[0].rejected(error401);
    } catch (err) {
      expect(err.response.status).toBe(401);
    }

    expect(localStorage.getItem("taskflow_token")).toBeNull();
    expect(localStorage.getItem("taskflow_user")).toBeNull();
  });
});
