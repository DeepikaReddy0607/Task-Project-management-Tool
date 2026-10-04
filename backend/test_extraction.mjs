export function extractTaskDetails(rawText, accessibleProjects = []) {
  let text = rawText.trim();

  // 1. Priority
  let priority = "Medium";
  const priorityMatch =
    text.match(/\b(?:with\s+)?(low|medium|high|critical)\s+priority\b/i) ||
    text.match(/\bpriority\s*[:=]?\s*(low|medium|high|critical)\b/i) ||
    text.match(/\b(low|medium|high|critical)\s+priority\b/i);

  if (priorityMatch) {
    const p = priorityMatch[1].toLowerCase();
    if (p === "low") priority = "Low";
    else if (p === "high" || p === "critical") priority = "High";
    else priority = "Medium";
    text = text.replace(priorityMatch[0], " ");
  }

  // 2. Status (optional)
  let status = "To Do";
  const statusMatch = text.match(
    /\b(?:status|in\s+status)\s*[:=]?\s*["']?(to\s+do|in\s+progress|review|backlog|completed)["']?/i
  );
  if (statusMatch) {
    const s = statusMatch[1].toLowerCase();
    if (s === "in progress") status = "In Progress";
    else if (s === "review") status = "Review";
    else if (s === "completed") status = "Completed";
    else if (s === "backlog") status = "Backlog";
    else status = "To Do";
    text = text.replace(statusMatch[0], " ");
  }

  // 3. Estimated Hours (optional)
  let estimatedHours = null;
  const hoursMatch =
    text.match(
      /\b(?:estimated(?:\s+at|\s+hours?)?|est\.?|takes?|duration(?:\s+of)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i
    ) || text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:estimated|estimate)?\b/i);
  if (hoursMatch) {
    estimatedHours = parseFloat(hoursMatch[1]);
    text = text.replace(hoursMatch[0], " ");
  }

  // 4. Description (optional)
  let description = null;
  const descMatch = text.match(
    /\b(?:with\s+)?(?:description|desc|notes?)\s*[:=]?\s*["']([^"']+)["']/i
  );
  if (descMatch) {
    description = descMatch[1].trim();
    text = text.replace(descMatch[0], " ");
  }

  // 5. Due Date
  let dueDate = null;
  let dueDateFormatted = "No due date";
  const now = new Date();

  // Helper for numeric & month name dates
  const parseSpecificDate = (s) => {
    if (!s) return null;
    const cleanStr = s.trim().replace(/^[,\s]+|[,\s]+$/g, "");

    // A. DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmy = cleanStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10);
      const y = parseInt(dmy[3], 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dt = new Date(y, m - 1, d);
        const formatted = new Intl.DateTimeFormat("en", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).format(dt);
        return { iso, formatted };
      }
    }

    // B. YYYY-MM-DD or YYYY/MM/DD
    const ymd = cleanStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (ymd) {
      const y = parseInt(ymd[1], 10);
      const m = parseInt(ymd[2], 10);
      const d = parseInt(ymd[3], 10);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dt = new Date(y, m - 1, d);
        const formatted = new Intl.DateTimeFormat("en", {
          month: "long",
          day: "numeric",
          year: "numeric"
        }).format(dt);
        return { iso, formatted };
      }
    }

    // C. Month name Day Year (e.g. October 3 2026, Oct 3, 2026)
    const monthMap = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
      apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
      aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
      nov: 11, november: 11, dec: 12, december: 12
    };

    const tm1 = cleanStr.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s*(\d{4})?$/i);
    if (tm1 && monthMap[tm1[1].toLowerCase()]) {
      const m = monthMap[tm1[1].toLowerCase()];
      const d = parseInt(tm1[2], 10);
      const y = tm1[3] ? parseInt(tm1[3], 10) : now.getFullYear();
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dt = new Date(y, m - 1, d);
      const formatted = new Intl.DateTimeFormat("en", {
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(dt);
      return { iso, formatted };
    }

    // D. Day Month name Year (e.g. 3 October 2026, 3rd of Oct 2026)
    const tm2 = cleanStr.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+([a-zA-Z]+)(?:,)?\s*(\d{4})?$/i);
    if (tm2 && monthMap[tm2[2].toLowerCase()]) {
      const d = parseInt(tm2[1], 10);
      const m = monthMap[tm2[2].toLowerCase()];
      const y = tm2[3] ? parseInt(tm2[3], 10) : now.getFullYear();
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dt = new Date(y, m - 1, d);
      const formatted = new Intl.DateTimeFormat("en", {
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(dt);
      return { iso, formatted };
    }

    return null;
  };

  // Check for due clause: due <date> or by <date>
  const dueClauseMatch = text.match(
    /\b(?:due(?:\s+date)?(?:\s+(?:on|by|at|is|for))?|by\s+)([\w\d\s\/\-\.,]+?)(?=(?:\s+(?:in|under|for|with|desc|status)|$|,|\.))/i
  );

  let dateMatchText = dueClauseMatch ? dueClauseMatch[1].trim() : null;

  if (dateMatchText) {
    if (/\btoday\b/i.test(dateMatchText)) {
      dueDate = now.toISOString().slice(0, 10);
      dueDateFormatted = "Today";
      text = text.replace(dueClauseMatch[0], " ");
    } else if (/\btomorrow\b/i.test(dateMatchText)) {
      const tom = new Date(now);
      tom.setDate(tom.getDate() + 1);
      dueDate = tom.toISOString().slice(0, 10);
      dueDateFormatted = "Tomorrow";
      text = text.replace(dueClauseMatch[0], " ");
    } else if (/\b(?:this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(dateMatchText)) {
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const targetDayName = dateMatchText.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)[1].toLowerCase();
      const targetDay = dayNames.indexOf(targetDayName);
      const currentDay = now.getDay();
      const diff = (targetDay - currentDay + 7) % 7 || 7;
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + diff);
      dueDate = targetDate.toISOString().slice(0, 10);
      dueDateFormatted = new Intl.DateTimeFormat("en", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(targetDate);
      text = text.replace(dueClauseMatch[0], " ");
    } else if (/\bnext week\b/i.test(dateMatchText)) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + 7);
      dueDate = targetDate.toISOString().slice(0, 10);
      dueDateFormatted = "Next week";
      text = text.replace(dueClauseMatch[0], " ");
    } else {
      const parsed = parseSpecificDate(dateMatchText);
      if (parsed) {
        dueDate = parsed.iso;
        dueDateFormatted = parsed.formatted;
        text = text.replace(dueClauseMatch[0], " ");
      }
    }
  }

  // Fallback: search for standalone numeric or month-name date if no "due" keyword was used
  if (!dueDate) {
    const standaloneMatch = text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/);
    if (standaloneMatch) {
      const parsed = parseSpecificDate(standaloneMatch[1]);
      if (parsed) {
        dueDate = parsed.iso;
        dueDateFormatted = parsed.formatted;
        text = text.replace(standaloneMatch[0], " ");
      }
    }
  }

  // 6. Project matching
  let matchedProject = null;
  const projectClauseMatch = text.match(
    /\b(?:in|for|to|under)\s+(?:the\s+)?project\s+["']?([^"'\n,;]+?)["']?(?:\s|$|,|\.)/i
  );
  if (projectClauseMatch) {
    const projName = projectClauseMatch[1].trim().toLowerCase();
    matchedProject = accessibleProjects.find((p) => p.title.toLowerCase() === projName) || null;
    text = text.replace(projectClauseMatch[0], " ");
  } else {
    for (const p of accessibleProjects) {
      const escaped = p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
        matchedProject = p;
        text = text.replace(new RegExp(`\\b(in|for|to|under)?\\s*["']?${escaped}["']?\\b`, "i"), " ");
        break;
      }
    }
  }

  // 7. Title Extraction
  // Remove command prefixes and noise words
  let cleaned = text
    .replace(/^(?:please\s+)?(?:create|add|schedule|make|new)\s+/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/^(?:task|todo)\s+/i, "")
    .replace(/^(?:called|named|titled)\s+/i, "")
    .replace(/^["'“”‘’]|["'“”‘’]$/g, "")
    .replace(/^[:\-\s,]+|[:\-\s,]+$/g, "")
    .trim();

  // If there's an internal "a " or "task " remaining at front (e.g. from "create a low priority task called API Testing")
  cleaned = cleaned
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/^(?:task|todo)\s+/i, "")
    .replace(/^(?:called|named|titled)\s+/i, "")
    .replace(/^["'“”‘’]|["'“”‘’]$/g, "")
    .replace(/^[:\-\s,]+|[:\-\s,]+$/g, "")
    .trim();

  // Normalize casing for acronyms & words
  const acronyms = ["api", "ui", "ux", "qa", "db", "pr", "hr", "id", "url", "seo", "ai", "ml", "sdk", "cli"];
  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lw = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (acronyms.includes(lw)) {
        return w.toUpperCase();
      }
      if (w === w.toLowerCase()) {
        return w.charAt(0).toUpperCase() + w.slice(1);
      }
      return w;
    });

  const title = words.join(" ");

  return {
    title,
    priority,
    dueDate,
    dueDateFormatted,
    description,
    status,
    estimatedHours,
    matchedProject
  };
}

const variations = [
  "create a api testing due 03-10-2026 with low priority",
  "Create API Testing due 03-10-2026 with low priority",
  "Create a task called API Testing due October 3 2026 with low priority",
  "Create API Testing, low priority, due Friday",
  "Create a low priority task called API Testing due 03/10/2026"
];

for (const v of variations) {
  console.log("INPUT:", v);
  const res = extractTaskDetails(v, [{ id: "proj-1", title: "avengers" }]);
  console.log("EXTRACTED:", {
    title: res.title,
    dueDate: res.dueDate,
    dueDateFormatted: res.dueDateFormatted,
    priority: res.priority
  });
  console.log("-----------------------------------------");
}
