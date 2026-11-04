import React, { useState, useEffect, useRef } from "react";
import {
  FiPaperclip,
  FiUploadCloud,
  FiDownload,
  FiTrash2,
  FiFileText,
  FiImage,
  FiFile,
  FiAlertCircle,
  FiCheckCircle,
} from "react-icons/fi";
import Button from "../ui/Button";
import {
  getTaskAttachments,
  uploadTaskAttachment,
  getProjectAttachments,
  uploadProjectAttachment,
  downloadAttachment,
  deleteAttachment,
} from "../../services/api/attachmentApi";

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (fileType, fileName) => {
  const type = (fileType || "").toLowerCase();
  const name = (fileName || "").toLowerCase();

  if (type.startsWith("image/") || name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
    return FiImage;
  }
  if (
    type.includes("pdf") ||
    type.includes("text") ||
    type.includes("document") ||
    name.match(/\.(pdf|doc|docx|txt|md|xls|xlsx|ppt|pptx)$/)
  ) {
    return FiFileText;
  }
  return FiFile;
};

export default function FileSection({
  taskId,
  projectId,
  entityId,
  entityLabel = "task",
}) {
  const effectiveTaskId = taskId || (entityLabel === "task" ? entityId : null);
  const effectiveProjectId = projectId || (entityLabel === "project" ? entityId : null);

  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const fileInputRef = useRef(null);

  const fetchAttachments = async () => {
    if (!effectiveTaskId && !effectiveProjectId) return;
    try {
      setLoading(true);
      setError("");
      let res;
      if (effectiveTaskId) {
        res = await getTaskAttachments(effectiveTaskId);
      } else if (effectiveProjectId) {
        res = await getProjectAttachments(effectiveProjectId);
      }
      if (res?.data) {
        setAttachments(res.data);
      }
    } catch (err) {
      console.error("Failed to load attachments:", err);
      setError(err?.response?.data?.message || "Failed to load attachments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [effectiveTaskId, effectiveProjectId]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds the 10MB maximum limit.");
      return;
    }
    if (file.size === 0) {
      setError("Cannot upload an empty file.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setSuccess("");
      if (effectiveTaskId) {
        await uploadTaskAttachment(effectiveTaskId, file);
      } else if (effectiveProjectId) {
        await uploadProjectAttachment(effectiveProjectId, file);
      }
      setSuccess(`"${file.name}" uploaded successfully.`);
      await fetchAttachments();
    } catch (err) {
      console.error("Upload error:", err);
      setError(err?.response?.data?.message || "Failed to upload file.");
    } finally {
      setUploading(false);
      setTimeout(() => setSuccess(""), 4000);
    }
  };

  const handleDownload = async (att) => {
    try {
      await downloadAttachment(att.id, att.fileName);
    } catch (err) {
      console.error("Download error:", err);
      setError("Failed to download file.");
    }
  };

  const confirmDelete = async (attId) => {
    try {
      setError("");
      await deleteAttachment(attId);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
      setDeleteId(null);
    } catch (err) {
      console.error("Delete error:", err);
      setError(err?.response?.data?.message || "Failed to delete attachment.");
    }
  };

  const fileToDelete = attachments.find((a) => a.id === deleteId);

  return (
    <div className="mt-6 border-t border-[var(--color-border)] pt-5">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <FiPaperclip size={16} className="text-[var(--color-brand)]" />
          <span>Files &amp; Attachments ({attachments.length})</span>
        </h4>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />

        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5"
        >
          <FiUploadCloud size={15} />
          <span>{uploading ? "Uploading..." : "Attach File"}</span>
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-2.5 text-xs text-[var(--color-danger)]">
          <FiAlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--color-brand)] bg-[var(--color-brand-soft)] p-2.5 text-xs text-[var(--color-brand-hover)]">
          <FiCheckCircle size={15} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-xs text-[var(--color-text-muted)]">
          Loading files...
        </div>
      ) : attachments.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.fileType, att.fileName);
            return (
              <li
                key={att.id}
                className="flex items-center justify-between p-3 transition hover:bg-[var(--color-canvas-soft)]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-canvas-soft)] text-[var(--color-brand)]">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[var(--color-text)]">
                      {att.fileName}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-text-subtle)]">
                      {formatFileSize(att.fileSize)} • Uploaded by {att.uploaderName || "User"} •{" "}
                      {new Date(att.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button
                    type="button"
                    onClick={() => handleDownload(att)}
                    className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
                    title="Download file"
                  >
                    <FiDownload size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteId(att.id)}
                    className="rounded-lg p-1.5 text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                    title="Delete file"
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 cursor-pointer rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] p-6 text-center transition hover:border-[var(--color-brand)]"
        >
          <FiUploadCloud size={24} className="mx-auto text-[var(--color-text-subtle)]" />
          <p className="mt-2 text-xs font-medium text-[var(--color-text)]">
            No files attached yet
          </p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            Click here to attach a document, image, or file (up to 10MB)
          </p>
        </div>
      )}

      {fileToDelete && (
        <div className="mt-3 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3">
          <p className="text-xs text-[var(--color-text)]">
            Remove <strong>{fileToDelete.fileName}</strong>?
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => confirmDelete(fileToDelete.id)}
              className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)] text-white"
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
