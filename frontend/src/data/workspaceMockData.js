export const currentWorkspaceUser = {
  id: "user-geethika",
  name: "Geethika Sai Unnam",
  globalRole: "Member",
};

export const initialWorkspaces = [
  {
    id: "workspace-taskflow",
    name: "TaskFlow Studio",
    description: "A focused home for product planning, design handoffs, and delivery.",
    ownerId: "user-geethika",
    workspaceRole: "Owner",
    createdAt: "2026-08-04",
    members: [
      { id: "user-geethika", firstName: "Geethika", lastName: "Sai Unnam", email: "geethika@taskflow.dev", globalRole: "Member", workspaceRole: "Owner", joinedAt: "2026-08-04" },
      { id: "user-aria", firstName: "Aria", lastName: "Patel", email: "aria@taskflow.dev", globalRole: "Admin", workspaceRole: "Admin", joinedAt: "2026-08-05" },
      { id: "user-james", firstName: "James", lastName: "Morgan", email: "james@taskflow.dev", globalRole: "Member", workspaceRole: "Member", joinedAt: "2026-08-06" },
    ],
  },
  {
    id: "workspace-personal",
    name: "Personal planning",
    description: "A quieter workspace for personal goals and weekly planning.",
    ownerId: "user-aria",
    workspaceRole: "Member",
    createdAt: "2026-07-18",
    members: [
      { id: "user-aria", firstName: "Aria", lastName: "Patel", email: "aria@taskflow.dev", globalRole: "Admin", workspaceRole: "Owner", joinedAt: "2026-07-18" },
      { id: "user-geethika", firstName: "Geethika", lastName: "Sai Unnam", email: "geethika@taskflow.dev", globalRole: "Member", workspaceRole: "Member", joinedAt: "2026-07-19" },
    ],
  },
];

export const availableMembers = [
  { id: "user-lena", firstName: "Lena", lastName: "Brown", email: "lena@taskflow.dev", globalRole: "Member" },
  { id: "user-noah", firstName: "Noah", lastName: "Williams", email: "noah@taskflow.dev", globalRole: "Member" },
  { id: "user-maya", firstName: "Maya", lastName: "Chen", email: "maya@taskflow.dev", globalRole: "Admin" },
];
