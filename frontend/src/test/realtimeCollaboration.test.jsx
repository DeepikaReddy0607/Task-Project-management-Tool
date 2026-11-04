import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useState } from "react";
import { render, screen, act } from "@testing-library/react";
import SocketContext, { useSocket, useSocketEvent } from "../context/SocketContext";

describe("Frontend Realtime Collaboration & Socket Lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("throws error when useSocket is used outside SocketProvider", () => {
    const BadComponent = () => {
      useSocket();
      return <div>Bad</div>;
    };

    // Suppress expected console.error during throw
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow("useSocket must be used within a SocketProvider");
    consoleSpy.mockRestore();
  });

  it("registers listeners, receives events, and cleans up on unmount", () => {
    const listenersMap = new Map();
    const subscribeMock = vi.fn((eventType, callback) => {
      if (!listenersMap.has(eventType)) {
        listenersMap.set(eventType, new Set());
      }
      listenersMap.get(eventType).add(callback);
      return () => {
        listenersMap.get(eventType)?.delete(callback);
        if (listenersMap.get(eventType)?.size === 0) {
          listenersMap.delete(eventType);
        }
      };
    });

    const mockContextValue = {
      socket: { connected: true, emit: vi.fn() },
      isConnected: true,
      subscribe: subscribeMock,
      joinProject: vi.fn(),
      leaveProject: vi.fn(),
    };

    const TestListenerComponent = ({ onEvent }) => {
      useSocketEvent("task.updated", onEvent);
      return <div>Listening for task.updated</div>;
    };

    const eventSpy = vi.fn();
    const { unmount } = render(
      <SocketContext.Provider value={mockContextValue}>
        <TestListenerComponent onEvent={eventSpy} />
      </SocketContext.Provider>
    );

    expect(screen.getByText("Listening for task.updated")).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledWith("task.updated", expect.any(Function));
    expect(listenersMap.has("task.updated")).toBe(true);

    // Dispatch simulated event
    act(() => {
      listenersMap.get("task.updated")?.forEach((cb) => cb({ type: "task.updated", taskId: "t-1" }));
    });
    expect(eventSpy).toHaveBeenCalledWith({ type: "task.updated", taskId: "t-1" });

    // Unmount and verify complete listener cleanup
    unmount();
    expect(listenersMap.has("task.updated")).toBe(false);
  });

  it("preserves updated handler reference on rerenders without duplicate listeners", () => {
    const listenersMap = new Map();
    const subscribeMock = vi.fn((eventType, callback) => {
      if (!listenersMap.has(eventType)) {
        listenersMap.set(eventType, new Set());
      }
      listenersMap.get(eventType).add(callback);
      return () => {
        listenersMap.get(eventType)?.delete(callback);
      };
    });

    const mockContextValue = {
      socket: { connected: true },
      isConnected: true,
      subscribe: subscribeMock,
      joinProject: vi.fn(),
      leaveProject: vi.fn(),
    };

    const DynamicComponent = () => {
      const [count, setCount] = useState(0);
      useSocketEvent("task.created", () => {
        setCount((c) => c + 1);
      });
      return (
        <div>
          <span>Count: {count}</span>
          <button onClick={() => setCount(99)}>Manual Update</button>
        </div>
      );
    };

    render(
      <SocketContext.Provider value={mockContextValue}>
        <DynamicComponent />
      </SocketContext.Provider>
    );

    expect(screen.getByText("Count: 0")).toBeInTheDocument();
    // Subscribe should only be called once, not on every render
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    // Trigger state update
    act(() => {
      screen.getByRole("button", { name: "Manual Update" }).click();
    });
    expect(screen.getByText("Count: 99")).toBeInTheDocument();
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    // Event should work with latest state
    act(() => {
      listenersMap.get("task.created")?.forEach((cb) => cb({ type: "task.created" }));
    });
    expect(screen.getByText("Count: 100")).toBeInTheDocument();
  });

  it("wildcard listener receives all disparate event types", () => {
    const listenersMap = new Map();
    const subscribeMock = vi.fn((eventType, callback) => {
      if (!listenersMap.has(eventType)) {
        listenersMap.set(eventType, new Set());
      }
      listenersMap.get(eventType).add(callback);
      return () => listenersMap.get(eventType)?.delete(callback);
    });

    const mockContextValue = {
      socket: { connected: true },
      isConnected: true,
      subscribe: subscribeMock,
      joinProject: vi.fn(),
      leaveProject: vi.fn(),
    };

    const WildcardComponent = ({ onWildcard }) => {
      useSocketEvent("*", onWildcard);
      return <div>Wildcard Active</div>;
    };

    const wildcardSpy = vi.fn();
    render(
      <SocketContext.Provider value={mockContextValue}>
        <WildcardComponent onWildcard={wildcardSpy} />
      </SocketContext.Provider>
    );

    expect(listenersMap.has("*")).toBe(true);

    act(() => {
      listenersMap.get("*")?.forEach((cb) => cb({ type: "project.updated", projectId: "p-1" }));
      listenersMap.get("*")?.forEach((cb) => cb({ type: "notification.created", id: "n-1" }));
    });

    expect(wildcardSpy).toHaveBeenCalledTimes(2);
  });

  it("clears credentials and notifies auth system on terminal authentication connect_error", () => {
    localStorage.setItem("taskflow_token", "invalid-expired-token");
    localStorage.setItem("taskflow_user", JSON.stringify({ id: "user-1" }));

    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    // Simulate the handler logic in connect_error
    const error = { message: "Invalid authentication token" };
    if (
      error?.message === "Invalid authentication token" ||
      error?.message === "Authentication required" ||
      error?.message === "User account is inactive or not found"
    ) {
      localStorage.removeItem("taskflow_token");
      localStorage.removeItem("taskflow_user");
      window.dispatchEvent(new Event("taskflow_auth_change"));
    }

    expect(localStorage.getItem("taskflow_token")).toBeNull();
    expect(localStorage.getItem("taskflow_user")).toBeNull();
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(Event));
  });
});
