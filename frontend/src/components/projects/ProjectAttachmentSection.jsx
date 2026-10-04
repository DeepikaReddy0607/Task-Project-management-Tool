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
import Card from "../ui/Card";
import {
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
    name.match(/\.(pdf|doc|docx|txt|md)$/)
  ) {
    return FiFileText;
  }
  return FiFile;
};

export default function ProjectAttachmentSection({ projectId }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef(null);

  const fetchAttachments = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError("");
      const res = await getProjectAttachments(projectId);
      if (res?.data) {
        setAttachments(res.data);
      }
    } catch (err) {
      console.error("Failed to load project attachments:", err);
      setError(err?.response?.data?.message || "Failed to load project attachments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [projectId]);

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
      await uploadProjectAttachment(projectId, file);
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

  const handleDelete = async (attId) => {
    if (!window.confirm("Are you sure you want to remove this project attachment?")) return;

    try {
      setError("");
      await deleteAttachment(attId);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
    } catch (err) {
      console.error("Delete error:", err);
      setError(err?.response?.data?.message || "Failed to delete attachment.");
    }
  };

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <FiPaperclip size={18} className="text-[var(--color-brand)]" />
            <span>Project Files & Documentation ({attachments.length})</span>
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Shared documentation, specs, and assets for this project.
          </p>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={uploading}
        />

        <Button
          variant="primary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5"
        >
          <FiUploadCloud size={15} />
          <span>{uploading ? "Uploading..." : "Upload File"}</span>
        </Button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <FiAlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700">
          <FiCheckCircle size={15} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
          Loading project files...
        </div>
      ) : attachments.length > 0 ? (
        <ul className="mt-4 divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
          {attachments.map((att) => {
            const Icon = getFileIcon(att.fileType, att.fileName);
            return (
              <li
                key={att.id}
                className="flex items-center justify-between p-3.5 transition hover:bg-slate-50"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-brand)] border border-[var(--color-border)]">
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {att.fileName}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
                      {formatFileSize(att.fileSize)} • Uploaded by {att.uploaderName} •{" "}
                      {new Date(att.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDownload(att)}
                    className="flex items-center gap-1.5"
                  >
                    <FiDownload size={14} />
                    <span>Download</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(att.id)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-700 transition"
                    title="Delete file"
                  >
                    <FiTrash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 cursor-pointer rounded-xl border border-dashed border-[var(--color-border-strong)] bg-slate-50/50 p-8 text-center transition hover:border-[var(--color-brand)] hover:bg-slate-50"
        >
          <FiUploadCloud size={28} className="mx-auto text-[var(--color-text-subtle)]" />
          <p className="mt-2 text-sm font-medium text-[var(--color-text)]">
            No files uploaded yet
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Click here to attach specs, architecture diagrams, or team files (up to 10MB)
          </p>
        </div>
      )}
    </Card>
  );
}
