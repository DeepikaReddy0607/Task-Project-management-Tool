import fs from "node:fs";

// 1. projectApi.js
let pa = fs.readFileSync("frontend/src/services/api/projectApi.js", "utf8");
pa = pa.replace("api.patch(/projects//restore)", "api.patch(`/projects/${projectId}/restore`)");
fs.writeFileSync("frontend/src/services/api/projectApi.js", pa, "utf8");
console.log("Fixed projectApi.js");

// 2. taskApi.js
let ta = fs.readFileSync("frontend/src/services/api/taskApi.js", "utf8");
ta = ta.replace("api.patch(/tasks//restore)", "api.patch(`/tasks/${taskId}/restore`)");
ta = ta.replace("api.post(/tasks//duplicate)", "api.post(`/tasks/${taskId}/duplicate`)");
fs.writeFileSync("frontend/src/services/api/taskApi.js", ta, "utf8");
console.log("Fixed taskApi.js");

// 3. Tasks.jsx
let tp = fs.readFileSync("frontend/src/pages/tasks/Tasks.jsx", "utf8");
const isCrlf = tp.includes("\r\n");
let normalized = tp.replace(/\r\n/g, "\n");
normalized = normalized.replace(
    '  FiSearch,\n  FiX,\n} from "react-icons/fi";',
    '  FiSearch,\n  FiX,\n  FiCopy,\n  FiRotateCcw,\n} from "react-icons/fi";'
);
if (isCrlf) normalized = normalized.replace(/\n/g, "\r\n");
fs.writeFileSync("frontend/src/pages/tasks/Tasks.jsx", normalized, "utf8");
console.log("Fixed Tasks.jsx");
