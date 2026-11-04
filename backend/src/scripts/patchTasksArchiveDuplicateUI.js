import fs from "node:fs";

console.log("Patching backend and frontend for Task Archive, Restore & Duplication UI...");

// 1. backend/src/services/taskService.js
let ts = fs.readFileSync("backend/src/services/taskService.js", "utf8");
const isCrlfTs = ts.includes("\r\n");
ts = ts.replace(/\r\n/g, "\n");

if (!ts.includes("getMyTasks = async (userId, { archived } = {})")) {
    ts = ts.replace(
        "getMyTasks = async (userId) => {\n\n    const tasks = await prisma.tasks.findMany({\n        where: {\n            assigned_to: userId,\n            is_archived: false\n        },",
        "getMyTasks = async (userId, { archived } = {}) => {\n    const isArchived = archived === \"true\" || archived === true;\n    const tasks = await prisma.tasks.findMany({\n        where: {\n            assigned_to: userId,\n            is_archived: isArchived\n        },"
    );
    if (isCrlfTs) ts = ts.replace(/\n/g, "\r\n");
    fs.writeFileSync("backend/src/services/taskService.js", ts, "utf8");
    console.log("Updated taskService.js getMyTasks");
}

// 2. backend/src/controllers/taskController.js
let tc = fs.readFileSync("backend/src/controllers/taskController.js", "utf8");
const isCrlfTc = tc.includes("\r\n");
tc = tc.replace(/\r\n/g, "\n");

if (!tc.includes("req.user.userId,\n            { archived: req.query.archived }")) {
    tc = tc.replace(
        "const tasks = await getMyTasks(\n            req.user.userId\n        );",
        "const tasks = await getMyTasks(\n            req.user.userId,\n            { archived: req.query.archived }\n        );"
    );
    if (isCrlfTc) tc = tc.replace(/\n/g, "\r\n");
    fs.writeFileSync("backend/src/controllers/taskController.js", tc, "utf8");
    console.log("Updated taskController.js getMine");
}

// 3. frontend/src/services/api/taskApi.js
let ta = fs.readFileSync("frontend/src/services/api/taskApi.js", "utf8");
const isCrlfTa = ta.includes("\r\n");
ta = ta.replace(/\r\n/g, "\n");

if (!ta.includes("getMyTasks = async (params = {})")) {
    ta = ta.replace(
        "export const getMyTasks = async () => {\n  const response = await api.get(\"/tasks/my-tasks\");",
        "export const getMyTasks = async (params = {}) => {\n  const response = await api.get(\"/tasks/my-tasks\", { params });"
    );
    if (isCrlfTa) ta = ta.replace(/\n/g, "\r\n");
    fs.writeFileSync("frontend/src/services/api/taskApi.js", ta, "utf8");
    console.log("Updated taskApi.js getMyTasks");
}

// 4. frontend/src/pages/tasks/Tasks.jsx
let tp = fs.readFileSync("frontend/src/pages/tasks/Tasks.jsx", "utf8");
const isCrlfTp = tp.includes("\r\n");
tp = tp.replace(/\r\n/g, "\n");

// 4a. Add restoreTask, duplicateTask to imports
if (!tp.includes("restoreTask,")) {
    tp = tp.replace(
        "  archiveTask,\n  updateTaskStatus,",
        "  archiveTask,\n  restoreTask,\n  duplicateTask,\n  updateTaskStatus,"
    );
    console.log("Added restoreTask, duplicateTask imports to Tasks.jsx");
}

// 4b. Add FiCopy, FiRotateCcw to react-icons/fi
if (!tp.includes("FiRotateCcw")) {
    tp = tp.replace(
        "  FiSearch,\n  FiSliders,\n  FiTrash2,",
        "  FiSearch,\n  FiSliders,\n  FiTrash2,\n  FiCopy,\n  FiRotateCcw,"
    );
    console.log("Added FiCopy, FiRotateCcw to Tasks.jsx");
}

// 4c. Add handleRestoreTask and handleDuplicateTask
if (!tp.includes("const handleRestoreTask")) {
    const actionHandlers = `
  /* ==========================================================
     RESTORE & DUPLICATE
  ========================================================== */

  const handleRestoreTask = async (taskId) => {
    try {
      const response = await restoreTask(taskId);
      const restored = response.task || response;
      setTasks((current) =>
        current.map((item) =>
          item.id === taskId
            ? { ...item, isArchived: false }
            : item
        )
      );
      setNotice("Task restored successfully.");
    } catch (error) {
      setNotice(
        error.response?.data?.message || "Failed to restore task."
      );
    }
  };

  const handleDuplicateTask = async (taskId) => {
    try {
      const response = await duplicateTask(taskId);
      const duplicated = response.task || response;
      const normalized = normalizeTask(duplicated);
      setTasks((current) => [normalized, ...current]);
      setSelectedTaskId(duplicated.id);
      setNotice("Task duplicated successfully.");
    } catch (error) {
      setNotice(
        error.response?.data?.message || "Failed to duplicate task."
      );
    }
  };
`;

    tp = tp.replace(
        "  /* ==========================================================\n     ARCHIVE\n  ========================================================== */",
        `${actionHandlers}\n  /* ==========================================================\n     ARCHIVE\n  ========================================================== */`
    );
    console.log("Added handleRestoreTask and handleDuplicateTask to Tasks.jsx");
}

// 4d. Add Archived to tabs
if (!tp.includes('"Archived",\n  ];')) {
    tp = tp.replace(
        "  const tabs = [\n    \"All\",\n    ...taskStatuses,\n  ];",
        "  const tabs = [\n    \"All\",\n    ...taskStatuses,\n    \"Archived\",\n  ];"
    );
    console.log("Added Archived to tabs in Tasks.jsx");
}

// 4e. Update visibleTasks logic to support Archived tab
if (!tp.includes("activeTab === \"Archived\"")) {
    tp = tp.replace(
        "  const visibleTasks = activeTasks.filter(\n    (task) => {\n      const matchesTab =\n        activeTab === \"All\" ||\n        task.status === activeTab;",
        "  const taskPool = activeTab === \"Archived\" ? tasks.filter((t) => t.isArchived) : activeTasks;\n  const visibleTasks = taskPool.filter(\n    (task) => {\n      const matchesTab =\n        activeTab === \"All\" ||\n        activeTab === \"Archived\" ||\n        task.status === activeTab;"
    );
    console.log("Updated visibleTasks for Archived tab in Tasks.jsx");
}

// 4f. Load archived tasks when Archived tab is selected
if (!tp.includes("if (activeTab === \"Archived\") {")) {
    const loadArchivedEffect = `
  useEffect(() => {
    if (activeTab === "Archived") {
      getMyTasks({ archived: true })
        .then((response) => {
          const archivedTasks = (response.tasks || []).map(normalizeTask);
          setTasks((current) => {
            const existingIds = new Set(current.map((t) => t.id));
            const newArchived = archivedTasks.filter((t) => !existingIds.has(t.id));
            return [...current, ...newArchived];
          });
        })
        .catch(() => {});
    }
  }, [activeTab]);
`;

    tp = tp.replace(
        "  /* ==========================================================\n     FILTERING\n  ========================================================== */",
        `${loadArchivedEffect}\n  /* ==========================================================\n     FILTERING\n  ========================================================== */`
    );
    console.log("Added loadArchivedEffect to Tasks.jsx");
}

// 4g. Drawer buttons: Restore if archived, Duplicate + Edit + Archive if active
if (!tp.includes("handleDuplicateTask(selectedTask.id)")) {
    const oldButtons = `<Button
                  variant="secondary"
                  onClick={() =>
                    openForm(
                      "edit",
                      selectedTask
                    )
                  }
                >
                  <FiEdit2
                    size={16}
                  />
                  Edit
                </Button>

                <Button
                  variant="secondary"
                  onClick={() =>
                    setDialog(
                      "archive"
                    )
                  }
                  className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  <FiArchive
                    size={16}
                  />
                  Archive
                </Button>`;

    const newButtons = `{selectedTask.isArchived ? (
                  <Button
                    variant="secondary"
                    onClick={() => handleRestoreTask(selectedTask.id)}
                    className="text-[var(--color-brand)] hover:text-[var(--color-brand)]"
                  >
                    <FiRotateCcw size={16} />
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => handleDuplicateTask(selectedTask.id)}
                      title="Duplicate task"
                    >
                      <FiCopy size={16} />
                      Duplicate
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() =>
                        openForm(
                          "edit",
                          selectedTask
                        )
                      }
                    >
                      <FiEdit2
                        size={16}
                      />
                      Edit
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDialog(
                          "archive"
                        )
                      }
                      className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                    >
                      <FiArchive
                        size={16}
                      />
                      Archive
                    </Button>
                  </>
                )}`;

    tp = tp.replace(oldButtons, newButtons);
    console.log("Updated drawer buttons in Tasks.jsx");
}

if (isCrlfTp) tp = tp.replace(/\n/g, "\r\n");
fs.writeFileSync("frontend/src/pages/tasks/Tasks.jsx", tp, "utf8");
console.log("Successfully patched Tasks.jsx");
