import { useMemo, useState } from "react";
import { FiCheck, FiEdit2, FiMessageCircle, FiSend, FiTrash2 } from "react-icons/fi";
import Button from "../ui/Button";

const formatTimestamp = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Just now";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

function CommentAvatar({ comment }) {
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)]"
      aria-hidden="true"
    >
      {comment.authorInitials || "?"}
    </span>
  );
}

function CommentSection({ comments, onAddComment, onDeleteComment, onUpdateComment, taskId }) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingContent, setEditingContent] = useState("");
  const [addError, setAddError] = useState("");
  const [editError, setEditError] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const orderedComments = useMemo(
    () =>
      [...comments].sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt)),
    [comments]
  );

  const commentToDelete = comments.find((comment) => comment.id === deleteId);

  const submitComment = (event) => {
    event.preventDefault();

    const content = draft.trim();
    if (!content) {
      setAddError("Write a comment before adding it.");
      return;
    }

    onAddComment(taskId, content);
    setDraft("");
    setAddError("");
  };

  const startEditing = (comment) => {
    setEditingId(comment.id);
    setEditingContent(comment.content);
    setEditError("");
  };

  const saveEdit = (event, commentId) => {
    event.preventDefault();

    const content = editingContent.trim();
    if (!content) {
      setEditError("A comment cannot be empty.");
      return;
    }

    onUpdateComment(taskId, commentId, content);
    setEditingId(null);
    setEditingContent("");
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent("");
    setEditError("");
  };

  return (
    <section
      className="mt-6 border-t border-[var(--color-border)] pt-5"
      aria-labelledby="comments-heading"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)]"
          aria-hidden="true"
        >
          <FiMessageCircle size={19} />
        </span>
        <div>
          <h3
            id="comments-heading"
            className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]"
          >
            Comments
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {comments.length
              ? `${comments.length} comment${comments.length === 1 ? "" : "s"}`
              : "Share an update with your team."}
          </p>
        </div>
      </div>

      <form
        onSubmit={submitComment}
        className="mt-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4"
      >
        <label
          htmlFor={`comment-draft-${taskId}`}
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Add a comment
        </label>
        <textarea
          id={`comment-draft-${taskId}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (addError) setAddError("");
          }}
          rows={3}
          placeholder="Write an update, question, or note…"
          className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
          aria-invalid={addError ? "true" : undefined}
          aria-describedby={addError ? `comment-error-${taskId}` : undefined}
        />
        {addError && (
          <p
            id={`comment-error-${taskId}`}
            role="alert"
            className="mt-2 text-sm text-[var(--color-danger)]"
          >
            {addError}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button type="submit">
            <FiSend size={16} aria-hidden="true" />
            Add comment
          </Button>
        </div>
      </form>

      {orderedComments.length ? (
        <ol className="mt-5 space-y-4" aria-label="Task comments">
          {orderedComments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex gap-3">
                <CommentAvatar comment={comment} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {comment.authorName}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
                        {formatTimestamp(comment.createdAt)}
                        {comment.updatedAt && " · Edited"}
                      </p>
                    </div>
                    {comment.isOwn && editingId !== comment.id && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEditing(comment)}
                          aria-label={`Edit comment by ${comment.authorName}`}
                          title="Edit comment"
                          className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                        >
                          <FiEdit2 size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(comment.id)}
                          aria-label={`Delete comment by ${comment.authorName}`}
                          title="Delete comment"
                          className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
                        >
                          <FiTrash2 size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>

                  {editingId === comment.id ? (
                    <form onSubmit={(event) => saveEdit(event, comment.id)} className="mt-3">
                      <label htmlFor={`comment-edit-${comment.id}`} className="sr-only">
                        Edit your comment
                      </label>
                      <textarea
                        id={`comment-edit-${comment.id}`}
                        value={editingContent}
                        onChange={(event) => {
                          setEditingContent(event.target.value);
                          if (editError) setEditError("");
                        }}
                        rows={3}
                        autoFocus
                        className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                      />
                      {editError && (
                        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
                          {editError}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={cancelEdit}>
                          Cancel
                        </Button>
                        <Button type="submit">
                          <FiCheck size={16} aria-hidden="true" />
                          Save changes
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-muted)]">
                      {comment.content}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center">
          <FiMessageCircle
            size={22}
            className="mx-auto text-[var(--color-brand)]"
            aria-hidden="true"
          />
          <p className="mt-3 font-semibold text-[var(--color-text)]">No comments yet</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Start the conversation with a helpful update.
          </p>
        </div>
      )}

      {commentToDelete && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
          <p
            id={`delete-comment-${commentToDelete.id}`}
            className="text-sm text-[var(--color-text)]"
          >
            Delete your comment? This local preview action cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteId(null)}
              aria-describedby={`delete-comment-${commentToDelete.id}`}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onDeleteComment(taskId, commentToDelete.id);
                setDeleteId(null);
              }}
              aria-describedby={`delete-comment-${commentToDelete.id}`}
              className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default CommentSection;
