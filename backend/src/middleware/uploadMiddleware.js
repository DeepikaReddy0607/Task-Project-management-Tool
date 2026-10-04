import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Ensure storage directory exists
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "attachments");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Blocked dangerous extensions
const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".msi",
  ".dll",
  ".com",
  ".vbs",
  ".scr",
  ".jar",
  ".bin",
  ".app",
  ".dmg",
  ".php",
  ".phtml",
  ".cgi",
  ".pl",
]);

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

// Multer disk storage with UUID-based filenames
// to prevent collisions and path traversal.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },

  filename: (req, file, cb) => {
    const safeBaseName = path.basename(file.originalname || "");
    const ext = path.extname(safeBaseName).toLowerCase();
    const uniqueName = `${crypto.randomUUID()}${ext}`;

    cb(null, uniqueName);
  },
});

// File validation
const fileFilter = (req, file, cb) => {
  const safeBaseName = path.basename(file.originalname || "");
  const ext = path.extname(safeBaseName).toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return cb(
      new Error(
        `Upload blocked: Executable or script files with extension '${ext}' are not permitted.`
      ),
      false
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(
      new Error(`File type ${file.mimetype} is not allowed.`),
      false
    );
  }

  cb(null, true);
};

// 10 MB maximum upload limit
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

/**
 * Express middleware wrapper for single file upload
 * with safe error handling.
 */
export const uploadSingleAttachment = (req, res, next) => {
  const singleUpload = upload.single("file");

  singleUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: `File size exceeds the allowed limit of ${
            MAX_FILE_SIZE / (1024 * 1024)
          }MB.`,
        });
      }

      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }

    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "File validation failed.",
      });
    }

    // Reject empty files
    if (req.file && req.file.size === 0) {
      try {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (e) {
        // Ignore cleanup failure
      }

      return res.status(400).json({
        success: false,
        message: "Cannot upload an empty file.",
      });
    }

    next();
  });
};

export { UPLOAD_DIR };

export default upload;