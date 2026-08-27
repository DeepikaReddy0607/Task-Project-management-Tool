const canManageProject = (
    workspaceRole,
    projectRole
) => {
    // Workspace Owner/Admin can manage projects
    if (
        workspaceRole === "Owner" ||
        workspaceRole === "Admin"
    ) {
        return true;
    }

    // Project Admin/Project Manager can manage the project
    if (
        projectRole === "Admin" ||
        projectRole === "Project Manager"
    ) {
        return true;
    }

    return false;
};

export {
    canManageProject
};