export const projectWorkspaces = [
  { id: "workspace-taskflow", name: "TaskFlow Studio", currentUserRole: "Owner" },
  { id: "workspace-personal", name: "Personal planning", currentUserRole: "Member" },
];

export const projectUsers = [
  { id: "user-geethika", name: "Geethika Sai Unnam", email: "geethika@taskflow.dev", globalRole: "Member" },
  { id: "user-aria", name: "Aria Patel", email: "aria@taskflow.dev", globalRole: "Admin" },
  { id: "user-james", name: "James Morgan", email: "james@taskflow.dev", globalRole: "Member" },
  { id: "user-maya", name: "Maya Chen", email: "maya@taskflow.dev", globalRole: "Admin" },
  { id: "user-noah", name: "Noah Williams", email: "noah@taskflow.dev", globalRole: "Member" },
];

export const initialProjects = [
  {
    id: "project-product-launch",
    workspaceId: "workspace-taskflow",
    title: "TaskFlow product launch",
    description: "Coordinate the final product, design, and go-to-market work for the TaskFlow launch.",
    category: "Product",
    priority: "High",
    status: "In Progress",
    startDate: "2026-08-03",
    endDate: "2026-09-18",
    managerId: "user-geethika",
    isArchived: false,
    createdAt: "2026-08-01",
    members: [
      { userId: "user-geethika", role: "Manager" },
      { userId: "user-aria", role: "Contributor" },
      { userId: "user-james", role: "Contributor" },
    ],
    risks: [
      { id: "risk-launch-scope", title: "Late scope changes", description: "New launch requests could displace final validation work.", severity: "High", probability: "Medium", ownerId: "user-geethika", mitigationPlan: "Review changes in daily triage and defer non-critical requests.", status: "Open", createdAt: "2026-08-07" },
      { id: "risk-launch-content", title: "Content approvals delay", description: "Final customer-facing copy may miss the planned review window.", severity: "Medium", probability: "Low", ownerId: "user-aria", mitigationPlan: "Prepare approved fallback copy and set an approval deadline.", status: "Open", createdAt: "2026-08-09" },
    ],
  },
  {
    id: "project-design-system",
    workspaceId: "workspace-taskflow",
    title: "Design system refresh",
    description: "Bring core workspace patterns into a consistent, accessible TaskFlow visual language.",
    category: "Design",
    priority: "Medium",
    status: "Planning",
    startDate: "2026-08-14",
    endDate: "2026-10-03",
    managerId: "user-aria",
    isArchived: false,
    createdAt: "2026-08-12",
    members: [
      { userId: "user-aria", role: "Manager" },
      { userId: "user-geethika", role: "Contributor" },
      { userId: "user-maya", role: "Contributor" },
    ],
    risks: [
      { id: "risk-design-capacity", title: "Limited review capacity", description: "Design review time may be constrained during the launch period.", severity: "Medium", probability: "High", ownerId: "user-aria", mitigationPlan: "Batch decisions and reserve two weekly review windows.", status: "Closed", createdAt: "2026-08-16" },
    ],
  },
  {
    id: "project-weekly-planning",
    workspaceId: "workspace-personal",
    title: "Weekly planning rhythm",
    description: "A lightweight space for personal goals, habits, and weekly reflection.",
    category: "Personal",
    priority: "Low",
    status: "On Track",
    startDate: "2026-08-01",
    endDate: "2026-12-20",
    managerId: "user-aria",
    isArchived: false,
    createdAt: "2026-07-28",
    members: [
      { userId: "user-aria", role: "Manager" },
      { userId: "user-geethika", role: "Contributor" },
    ],
    risks: [],
  },
  {
    id: "project-archive-example",
    workspaceId: "workspace-taskflow",
    title: "Spring campaign retrospective",
    description: "A completed campaign review retained for reference.",
    category: "Marketing",
    priority: "Low",
    status: "Complete",
    startDate: "2026-04-02",
    endDate: "2026-05-12",
    managerId: "user-james",
    isArchived: true,
    createdAt: "2026-03-28",
    members: [{ userId: "user-james", role: "Manager" }],
    risks: [],
  },
];

export const projectOptions = {
  categories: ["Product", "Design", "Engineering", "Marketing", "Operations", "Personal"],
  priorities: ["Low", "Medium", "High", "Critical"],
  statuses: ["Planning", "In Progress", "On Track", "At Risk", "Complete"],
};
