import fs from "node:fs";

console.log("Patching frontend/src/pages/projects/Projects.jsx for Restore...");

let content = fs.readFileSync("frontend/src/pages/projects/Projects.jsx", "utf8");
const isCrlf = content.includes("\r\n");
let code = content.replace(/\r\n/g, "\n");

// 1. Add FiRotateCcw to react-icons/fi
if (!code.includes("FiRotateCcw")) {
    code = code.replace(
        'import { FiActivity, FiAlertTriangle, FiArchive,',
        'import { FiActivity, FiAlertTriangle, FiArchive, FiRotateCcw,'
    );
}

// 2. Add restoreProject as restoreProjectApi import
if (!code.includes("restoreProject as restoreProjectApi")) {
    code = code.replace(
        '  archiveProject as archiveProjectApi,',
        '  archiveProject as archiveProjectApi,\n  restoreProject as restoreProjectApi,'
    );
}

// 3. Add restoreProject handler function
if (!code.includes("const restoreProject = async")) {
    const restoreFunc = `
  const restoreProject = async () => {
    try {
      await restoreProjectApi(selectedProject.id);
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProject.id ? { ...project, isArchived: false } : project
        )
      );
      setSelectedProjectId(null);
      closeDialog();
    } catch (error) {
      setFormError(error.response?.data?.message || "Failed to restore project.");
    }
  };
`;
    code = code.replace(
        '  const archiveProject = async () => {',
        `${restoreFunc}\n  const archiveProject = async () => {`
    );
}

// 4. Add Restore button in drawer
if (!code.includes("Restore Project")) {
    const restoreButton = `
        {canManage && selectedProject.isArchived && (
          <Button
            variant="secondary"
            onClick={restoreProject}
            className="text-[var(--color-brand)] hover:text-[var(--color-brand)]"
          >
            <FiRotateCcw size={16} /> Restore Project
          </Button>
        )}
`;
    code = code.replace(
        '        {canManage && !selectedProject.isArchived && (',
        `${restoreButton}        {canManage && !selectedProject.isArchived && (`
    );
}

if (isCrlf) code = code.replace(/\n/g, "\r\n");
fs.writeFileSync("frontend/src/pages/projects/Projects.jsx", code, "utf8");
console.log("Successfully patched Projects.jsx");
