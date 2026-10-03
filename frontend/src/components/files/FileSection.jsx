import { useRef, useState } from "react";
import { FiArchive, FiFile, FiFileText, FiPaperclip, FiTrash2, FiUpload } from "react-icons/fi";
import Button from "../ui/Button";

const ACCEPTED_EXTENSIONS = ["zip", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
};

const formatDate = (value) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));

const getExtension = (fileName) => fileName.split(".").pop()?.toLowerCase() || "";

function FileTypeIcon({ extension }) {
  const Icon =
    extension === "zip"
      ? FiArchive
      : ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension)
        ? FiFileText
        : FiFile;

  return <Icon size={18} aria-hidden="true" />;
}

function FileSection({ entityId, entityLabel, files = [], onAddFile, onDeleteFile }) {
  const inputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteId, setDeleteId] = useState(null);

  const resetSelection = () => {
    setSelectedFile(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectFile = (event) => {
    const file = event.target.files?.[0];
    setNotice("");
    setError("");

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const extension = getExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setSelectedFile(null);
      setError("Choose a ZIP, DOC, DOCX, XLS, XLSX, PPT, or PPTX file.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setError("Files must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }

    setSelectedFile(file);
  };

  const uploadFile = (event) => {
    event.preventDefault();

    if (!selectedFile) {
      setError("Choose a file before adding it.");
      return;
    }

    const extension = getExtension(selectedFile.name);
    onAddFile(entityId, {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: selectedFile.name,
      fileType: extension.toUpperCase(),
      fileSize: selectedFile.size,
      uploadedBy: "You",
      createdAt: new Date().toISOString(),
      fileUrl: "",
    });
    setNotice(`${selectedFile.name} added to this ${entityLabel}.`);
    resetSelection();
  };

  const fileToDelete = files.find((file) => file.id === deleteId);

  return (
    <section
      className="mt-6 border-t border-[var(--color-border)] pt-5"
      aria-labelledby={`${entityLabel}-files-heading`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-info-soft)] text-[var(--color-info)]"
          aria-hidden="true"
        >
          <FiPaperclip size={19} />
        </span>
        <div>
          <h3
            id={`${entityLabel}-files-heading`}
            className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]"
          >
            Files
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Attach supporting documents to this {entityLabel}.
          </p>
        </div>
      </div>

      <form
        onSubmit={uploadFile}
        className="mt-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas-soft)] p-4"
      >
        <label
          htmlFor={`${entityLabel}-file-${entityId}`}
          className="block text-sm font-semibold text-[var(--color-text)]"
        >
          Choose a file
        </label>
        <input
          ref={inputRef}
          id={`${entityLabel}-file-${entityId}`}
          type="file"
          accept=".zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          onChange={selectFile}
          className="mt-2 block w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-surface)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--color-brand-hover)] hover:file:bg-[var(--color-surface-sage)]"
          aria-describedby={error ? `${entityLabel}-file-error-${entityId}` : undefined}
          aria-invalid={Boolean(error)}
        />
        <p className="mt-2 text-xs text-[var(--color-text-subtle)]">
          ZIP, DOC, DOCX, XLS, XLSX, PPT, or PPTX up to 10 MB.
        </p>
        {selectedFile && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">
            <span className="min-w-0 break-all font-medium text-[var(--color-text)]">
              {selectedFile.name}{" "}
              <span className="text-[var(--color-text-muted)]">
                ({formatBytes(selectedFile.size)})
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-2"
              onClick={resetSelection}
            >
              Cancel
            </Button>
          </div>
        )}
        {error && (
          <p
            id={`${entityLabel}-file-error-${entityId}`}
            role="alert"
            className="mt-2 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-2 text-sm text-[var(--color-success)]">
            {notice}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!selectedFile}>
            <FiUpload size={16} aria-hidden="true" />
            Add file
          </Button>
        </div>
      </form>

      {files.length ? (
        <ul
          className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          aria-label={`${entityLabel} files`}
        >
          {files.map((file) => {
            const extension = getExtension(file.fileName);
            return (
              <li
                key={file.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]">
                    <FileTypeIcon extension={extension} />
                  </span>
                  <div className="min-w-0">
                    <p className="break-all text-sm font-semibold text-[var(--color-text)]">
                      {file.fileName}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
                      {file.fileType} · {formatBytes(file.fileSize)} · Added{" "}
                      {formatDate(file.createdAt)} by {file.uploadedBy || "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    disabled
                    title="File preview is available after file storage is connected"
                  >
                    Preview unavailable
                  </Button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(file.id)}
                    aria-label={`Delete ${file.fileName}`}
                    title="Delete file"
                    className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
                  >
                    <FiTrash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center">
          <FiPaperclip size={22} className="mx-auto text-[var(--color-brand)]" aria-hidden="true" />
          <p className="mt-3 font-semibold text-[var(--color-text)]">No files attached</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Choose a supported document above to keep important context nearby.
          </p>
        </div>
      )}

      {fileToDelete && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
          <p
            id={`${entityLabel}-delete-file-${fileToDelete.id}`}
            className="text-sm text-[var(--color-text)]"
          >
            Delete <strong>{fileToDelete.fileName}</strong>? This local preview action cannot be
            undone.
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setDeleteId(null)}
              aria-describedby={`${entityLabel}-delete-file-${fileToDelete.id}`}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onDeleteFile(entityId, fileToDelete.id);
                setDeleteId(null);
              }}
              aria-describedby={`${entityLabel}-delete-file-${fileToDelete.id}`}
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

export default FileSection;
