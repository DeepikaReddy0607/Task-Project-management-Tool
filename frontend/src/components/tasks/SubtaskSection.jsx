import { useEffect, useState } from "react";
import { FiCheck, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import Button from "../ui/Button";
import Input from "../ui/Input";
import {
  getSubtasks,
  createSubtask,
  updateSubtask,
  updateSubtaskStatus,
  deleteSubtask,
} from "../../services/api/subtaskApi";

const emptyForm = {
  title: "",
  description: "",
  dueDate: "",
  assignedTo: "",
  status: "To Do",
};

function normalizeSubtask(subtask) {
  return {
    id: subtask.id,
    title: subtask.title || "",
    description: subtask.description || "",
    dueDate: subtask.due_date
      ? String(subtask.due_date).slice(0, 10)
      : "",
    assignedTo: subtask.assigned_to || "",
    status: subtask.status || "To Do",
  };
}

function SubtaskSection({
  assignees,
  formatDate,
  statusClasses,
  statuses,
  taskId,
}) {
  const [subtasks, setSubtasks] = useState([]);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load persisted subtasks whenever the task changes/opening occurs.
  useEffect(() => {
    let cancelled = false;

    const loadSubtasks = async () => {
      if (!taskId) {
        setSubtasks([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError("");

        const response = await getSubtasks(taskId);

        if (cancelled) return;

        const items = Array.isArray(response?.subtasks)
          ? response.subtasks.map(normalizeSubtask)
          : [];

        setSubtasks(items);
      } catch (error) {
        if (cancelled) return;

        console.error("LOAD SUBTASKS ERROR:", error);
        console.error(
          "LOAD SUBTASKS RESPONSE:",
          error.response?.data
        );

        setLoadError(
          error.response?.data?.message ||
            error.message ||
            "Failed to load subtasks."
        );
        setSubtasks([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSubtasks();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const completed = subtasks.filter(
    (item) => item.status === "Completed"
  ).length;

  const progress = subtasks.length
    ? Math.round((completed / subtasks.length) * 100)
    : 0;

  const deletingSubtask = subtasks.find(
    (item) => item.id === deleteId
  );

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openEditor = (subtask) => {
    setEditor(subtask?.id || "new");

    setForm(
      subtask
        ? {
            title: subtask.title || "",
            description: subtask.description || "",
            dueDate: subtask.dueDate || "",
            assignedTo: subtask.assignedTo || "",
            status: subtask.status || "To Do",
          }
        : { ...emptyForm }
    );

    setError("");
  };

  const saveSubtask = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Subtask title is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        status: form.status,
        dueDate: form.dueDate || null,
        assignedTo: form.assignedTo || null,
      };

      if (editor === "new") {
        const response = await createSubtask(taskId, data);

        const createdSubtask = normalizeSubtask(
          response.subtask
        );

        setSubtasks((current) => [
          ...current,
          createdSubtask,
        ]);
      } else {
        const response = await updateSubtask(
          editor,
          data
        );

        const updatedSubtask = normalizeSubtask(
          response.subtask
        );

        setSubtasks((current) =>
          current.map((item) =>
            item.id === editor
              ? updatedSubtask
              : item
          )
        );
      }

      setEditor(null);
      setForm({ ...emptyForm });
    } catch (error) {
      console.error("SAVE SUBTASK ERROR:", error);
      console.error(
        "SAVE SUBTASK RESPONSE:",
        error.response?.data
      );

      setError(
        error.response?.data?.message ||
          error.message ||
          "Failed to save subtask."
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      const response = await updateSubtaskStatus(
        id,
        status
      );

      const updatedSubtask = normalizeSubtask(
        response.subtask
      );

      setSubtasks((current) =>
        current.map((item) =>
          item.id === id
            ? updatedSubtask
            : item
        )
      );
    } catch (error) {
      console.error(
        "UPDATE SUBTASK STATUS ERROR:",
        error
      );

      setLoadError(
        error.response?.data?.message ||
          error.message ||
          "Failed to update subtask status."
      );
    }
  };

  const confirmDeleteSubtask = async () => {
    if (!deleteId) return;

    try {
      setDeleting(true);

      await deleteSubtask(deleteId);

      setSubtasks((current) =>
        current.filter((item) => item.id !== deleteId)
      );

      setDeleteId(null);
    } catch (error) {
      console.error(
        "DELETE SUBTASK ERROR:",
        error
      );

      setLoadError(
        error.response?.data?.message ||
          error.message ||
          "Failed to delete subtask."
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section
      className="mt-6 border-t border-[var(--color-border)] pt-5"
      aria-labelledby="subtasks-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3
            id="subtasks-heading"
            className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]"
          >
            Subtasks
          </h3>

          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {completed} of {subtasks.length} completed
          </p>
        </div>

        <Button
          variant="soft"
          onClick={() => openEditor()}
        >
          <FiPlus size={16} />
          Add subtask
        </Button>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"
        aria-label={
          progress + "% of subtasks complete"
        }
      >
        <div
          className="h-full rounded-full bg-[var(--color-brand)] transition-[width] duration-200"
          style={{ width: progress + "%" }}
        />
      </div>

      {loadError && (
        <div className="mt-4 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-text)]">
          {loadError}
        </div>
      )}

      {editor && (
        <form
          onSubmit={saveSubtask}
          className="mt-5 space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4"
        >
          <h4 className="font-semibold text-[var(--color-text)]">
            {editor === "new"
              ? "Add subtask"
              : "Edit subtask"}
          </h4>

          <Input
            id="subtask-title"
            label="Title"
            value={form.title}
            onChange={(event) =>
              updateForm(
                "title",
                event.target.value
              )
            }
            error={error}
            autoFocus
          />

          <label className="block text-sm font-medium text-[var(--color-text)]">
            Description

            <textarea
              value={form.description}
              onChange={(event) =>
                updateForm(
                  "description",
                  event.target.value
                )
              }
              rows={3}
              className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand)]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              id="subtask-due-date"
              label="Due date"
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                updateForm(
                  "dueDate",
                  event.target.value
                )
              }
            />

            <label className="block text-sm font-medium text-[var(--color-text)]">
              Assignee

              <select
                value={form.assignedTo}
                onChange={(event) =>
                  updateForm(
                    "assignedTo",
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm"
              >
                <option value="">
                  Unassigned
                </option>

                {assignees.map((user) => (
                  <option
                    key={user.id}
                    value={user.id}
                  >
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-[var(--color-text)]">
              Status

              <select
                value={form.status}
                onChange={(event) =>
                  updateForm(
                    "status",
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm"
              >
                {statuses.map((status) => (
                  <option key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditor(null);
                setError("");
              }}
              disabled={saving}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={saving}
            >
              <FiCheck size={16} />
              {saving
                ? "Saving..."
                : "Save subtask"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading subtasks...
          </p>
        </div>
      ) : subtasks.length ? (
        <ul className="mt-5 space-y-3">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[var(--color-text)]">
                      {subtask.title}
                    </p>

                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (statusClasses[subtask.status] ||
                          statusClasses["To Do"])
                      }
                    >
                      {subtask.status}
                    </span>
                  </div>

                  {subtask.description && (
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {subtask.description}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
                    {(assignees.find(
                      (user) =>
                        user.id ===
                        subtask.assignedTo
                    )?.name ||
                      "Unassigned") +
                      " / " +
                      formatDate(
                        subtask.dueDate
                      )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <select
                    aria-label={
                      "Change status for " +
                      subtask.title
                    }
                    value={subtask.status}
                    onChange={(event) =>
                      changeStatus(
                        subtask.id,
                        event.target.value
                      )
                    }
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs"
                  >
                    {statuses.map((status) => (
                      <option key={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      openEditor(subtask)
                    }
                    className="rounded-lg p-2 text-[var(--color-text-subtle)] hover:bg-[var(--color-canvas-soft)]"
                    aria-label={
                      "Edit " + subtask.title
                    }
                  >
                    <FiEdit2 size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDeleteId(subtask.id)
                    }
                    className="rounded-lg p-2 text-[var(--color-text-subtle)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                    aria-label={
                      "Delete " + subtask.title
                    }
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center">
          <p className="font-semibold text-[var(--color-text)]">
            No subtasks yet
          </p>

          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Break this task into clear,
            manageable steps.
          </p>
        </div>
      )}

      {deletingSubtask && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Delete subtask"
          className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4"
        >
          <p className="text-sm text-[var(--color-text)]">
            Delete{" "}
            <strong>
              {deletingSubtask.title}
            </strong>
            ?
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>

            <Button
              onClick={confirmDeleteSubtask}
              disabled={deleting}
              className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default SubtaskSection;