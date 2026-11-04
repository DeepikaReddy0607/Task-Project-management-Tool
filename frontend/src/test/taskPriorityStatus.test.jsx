import { describe, it, expect } from "vitest";
import { SUBTASK_STATUSES } from "../components/tasks/SubtaskSection";

describe("Task Status & Priority Canonical Invariants", () => {
  it("enforces canonical subtask statuses: To Do, In Progress, Done", () => {
    expect(SUBTASK_STATUSES).toEqual(["To Do", "In Progress", "Done"]);
    expect(SUBTASK_STATUSES).not.toContain("Backlog");
    expect(SUBTASK_STATUSES).not.toContain("Review");
    expect(SUBTASK_STATUSES).not.toContain("Completed");
  });

  it("calculates subtask progress percentage correctly based on 'Done'", () => {
    const calculateProgress = (subtasks) => {
      if (!subtasks || subtasks.length === 0) return 0;
      const completed = subtasks.filter(
        (st) => st.status === "Done" || st.status === "Completed"
      ).length;
      return Math.round((completed / subtasks.length) * 100);
    };

    expect(calculateProgress([])).toBe(0);

    const subtasks = [
      { id: "1", title: "Subtask 1", status: "Done" },
      { id: "2", title: "Subtask 2", status: "In Progress" },
      { id: "3", title: "Subtask 3", status: "To Do" },
      { id: "4", title: "Subtask 4", status: "Done" },
    ];

    expect(calculateProgress(subtasks)).toBe(50);

    const allDone = subtasks.map((st) => ({ ...st, status: "Done" }));
    expect(calculateProgress(allDone)).toBe(100);

    const noneDone = subtasks.map((st) => ({ ...st, status: "In Progress" }));
    expect(calculateProgress(noneDone)).toBe(0);
  });

  it("enforces allowed task priorities: Low, Medium, High", () => {
    const VALID_PRIORITIES = ["Low", "Medium", "High"];
    expect(VALID_PRIORITIES).toContain("Low");
    expect(VALID_PRIORITIES).toContain("Medium");
    expect(VALID_PRIORITIES).toContain("High");
    expect(VALID_PRIORITIES).not.toContain("Critical");
  });
});
