import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import api from "../services/api/axios";

describe("Frontend Form Validation & Submission Protection", () => {
  it("validates required email and password format on Login form", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/email address is required/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it("validates invalid email format and minimum password length", async () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const emailInput = screen.getByPlaceholderText("you@example.com");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "invalid-email" } });
    fireEvent.change(passwordInput, { target: { value: "123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/enter a valid email address/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/password must be at least 6 characters/i)
      ).toBeInTheDocument();
    });
  });

  it("displays server error banner and prevents repeated submission while pending", async () => {
    // Mock login api to delay and reject with 401
    let resolvePost;
    const postPromise = new Promise((resolve, reject) => {
      resolvePost = () =>
        reject({
          response: {
            status: 401,
            data: { message: "Invalid email or password" },
          },
        });
    });

    vi.spyOn(api, "post").mockImplementation(() => postPromise);

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const emailInput = screen.getByPlaceholderText("you@example.com");
    const passwordInput = screen.getByPlaceholderText("Enter your password");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "user@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "validpassword123" } });
    fireEvent.click(submitBtn);

    // Button should be disabled during submission
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });

    // Resolve rejection
    resolvePost();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(
        screen.getByText(/invalid email or password/i)
      ).toBeInTheDocument();
    });
  });

  it("validates password match confirmation on Register form", async () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    const pwdInputs = screen.getAllByPlaceholderText(/password/i);
    const pwdInput = pwdInputs[0];
    const confirmPwdInput = pwdInputs[1];
    const submitBtn = screen.getByRole("button", { name: /create account/i });

    fireEvent.change(pwdInput, { target: { value: "Secret123!" } });
    fireEvent.change(confirmPwdInput, { target: { value: "Mismatch999!" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });
});
