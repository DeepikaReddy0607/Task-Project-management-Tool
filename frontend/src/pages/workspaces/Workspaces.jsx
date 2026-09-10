import { useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronRight,
  FiEdit2,
  FiLayers,
  FiPlus,
  FiTrash2,
  FiUserMinus,
  FiUserPlus,
  FiUsers,
  FiX,
} from "react-icons/fi";

import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

import {
  getWorkspaces,
  getWorkspaceMembers,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace as deleteWorkspaceApi,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
} from "../../services/api/workspaceApi";

const roleClasses = {
  Owner:
    "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  Admin:
    "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  Member:
    "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
};

const formatDate = (value) => {
  if (!value) return "Not available";

  const stringValue = String(value);

  const date =
    stringValue.length === 10
      ? new Date(`${stringValue}T00:00:00`)
      : new Date(stringValue);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

function Dialog({ children, onClose, title }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-4 backdrop-blur-sm sm:items-center"
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-dialog-title"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2
            id="workspace-dialog-title"
            className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]"
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"
          >
            <FiX size={19} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Workspaces() {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] =
    useState("");

  const [selectedWorkspaceMembers, setSelectedWorkspaceMembers] =
    useState([]);

  const [dialog, setDialog] = useState(null);

  const [formValues, setFormValues] = useState({
    name: "",
    description: "",
  });

  const [formError, setFormError] = useState("");

  const [memberToAdd, setMemberToAdd] = useState("");
  const [memberRoleToAdd, setMemberRoleToAdd] =
    useState("Member");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find(
        (workspace) =>
          workspace.id === selectedWorkspaceId
      ) || null,
    [workspaces, selectedWorkspaceId]
  );

  const currentRole =
    selectedWorkspace?.workspaceRole || "";

  const canEditWorkspace =
    currentRole === "Owner";

  const canManageMembers =
    currentRole === "Owner" ||
    currentRole === "Admin";

  const canManageRoles =
    currentRole === "Owner";

  /* ==========================================================
     LOAD WORKSPACES
  ========================================================== */

  const loadWorkspaces = async () => {
    try {
      setIsLoading(true);
      setFormError("");

      const response = await getWorkspaces();

      const workspaceList =
        response?.workspaces || [];

      setWorkspaces(workspaceList);

      setSelectedWorkspaceId((currentId) => {
        if (!workspaceList.length) {
          return "";
        }

        const currentStillExists =
          workspaceList.some(
            (workspace) =>
              workspace.id === currentId
          );

        return currentStillExists
          ? currentId
          : workspaceList[0].id;
      });
    } catch (error) {
      console.error(
        "Failed to load workspaces:",
        error
      );

      setWorkspaces([]);
      setSelectedWorkspaceId("");

      setFormError(
        error.response?.data?.message ||
          "Failed to load workspaces."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  /* ==========================================================
     LOAD WORKSPACE MEMBERS
  ========================================================== */

  useEffect(() => {
    const loadMembers = async () => {
      if (!selectedWorkspaceId) {
        setSelectedWorkspaceMembers([]);
        return;
      }

      try {
        setFormError("");

        const response =
          await getWorkspaceMembers(
            selectedWorkspaceId
          );

        setSelectedWorkspaceMembers(
          response?.members || []
        );
      } catch (error) {
        console.error(
          "Failed to load workspace members:",
          error
        );

        setSelectedWorkspaceMembers([]);

        setFormError(
          error.response?.data?.message ||
            "Failed to load workspace members."
        );
      }
    };

    loadMembers();
  }, [selectedWorkspaceId]);

  /* ==========================================================
     DIALOG
  ========================================================== */

  const closeDialog = () => {
    setDialog(null);
    setFormError("");
    setMemberToAdd("");
    setMemberRoleToAdd("Member");
  };

  const openWorkspaceDialog = (mode) => {
    if (mode === "edit" && !selectedWorkspace) {
      return;
    }

    setFormValues(
      mode === "edit"
        ? {
            name: selectedWorkspace?.name || "",
            description:
              selectedWorkspace?.description || "",
          }
        : {
            name: "",
            description: "",
          }
    );

    setFormError("");
    setDialog(mode);
  };

  /* ==========================================================
     CREATE / UPDATE WORKSPACE
  ========================================================== */

  const submitWorkspace = async (event) => {
    event.preventDefault();

    const name = formValues.name.trim();

    if (!name) {
      setFormError(
        "Workspace name is required."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError("");

      if (dialog === "create") {
        const response =
          await createWorkspace({
            name,
            description:
              formValues.description.trim() ||
              null,
          });

        const createdWorkspace =
          response?.workspace;

        await loadWorkspaces();

        if (createdWorkspace?.id) {
          setSelectedWorkspaceId(
            createdWorkspace.id
          );
        }
      } else if (
        dialog === "edit" &&
        selectedWorkspace
      ) {
        await updateWorkspace(
          selectedWorkspace.id,
          {
            name,
            description:
              formValues.description.trim() ||
              null,
          }
        );

        await loadWorkspaces();
      }

      closeDialog();
    } catch (error) {
      console.error(
        "Failed to save workspace:",
        error
      );

      setFormError(
        error.response?.data?.message ||
          "Failed to save workspace."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================================
     DELETE WORKSPACE
  ========================================================== */

  const handleDeleteWorkspace = async () => {
    if (!selectedWorkspace) return;

    try {
      setIsSubmitting(true);
      setFormError("");

      await deleteWorkspaceApi(
        selectedWorkspace.id
      );

      closeDialog();

      await loadWorkspaces();
    } catch (error) {
      console.error(
        "Failed to delete workspace:",
        error
      );

      setFormError(
        error.response?.data?.message ||
          "Failed to delete workspace."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================================
     ADD MEMBER
  ========================================================== */

  const handleAddMember = async () => {
    if (!selectedWorkspaceId) {
      setFormError(
        "No workspace selected."
      );
      return;
    }

    if (!memberToAdd) {
      setFormError(
        "Please select a user."
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setFormError("");

      await addWorkspaceMember(
        selectedWorkspaceId,
        {
          userId: memberToAdd,
          workspaceRole:
            memberRoleToAdd,
        }
      );

      const response =
        await getWorkspaceMembers(
          selectedWorkspaceId
        );

      setSelectedWorkspaceMembers(
        response?.members || []
      );

      closeDialog();
    } catch (error) {
      console.error(
        "Failed to add workspace member:",
        error
      );

      setFormError(
        error.response?.data?.message ||
          "Failed to add workspace member."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================================
     REMOVE MEMBER
  ========================================================== */

  const handleRemoveMember = async (
    memberId
  ) => {
    if (!selectedWorkspaceId) return;

    try {
      setIsSubmitting(true);
      setFormError("");

      await removeWorkspaceMember(
        selectedWorkspaceId,
        memberId
      );

      const response =
        await getWorkspaceMembers(
          selectedWorkspaceId
        );

      setSelectedWorkspaceMembers(
        response?.members || []
      );

      closeDialog();
    } catch (error) {
      console.error(
        "Failed to remove workspace member:",
        error
      );

      setFormError(
        error.response?.data?.message ||
          "Failed to remove workspace member."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================================
     CHANGE MEMBER ROLE
  ========================================================== */

  const handleChangeMemberRole = async (
    memberId,
    workspaceRole
  ) => {
    if (!selectedWorkspaceId) return;

    try {
      setFormError("");

      await updateWorkspaceMemberRole(
        selectedWorkspaceId,
        memberId,
        workspaceRole
      );

      const response =
        await getWorkspaceMembers(
          selectedWorkspaceId
        );

      setSelectedWorkspaceMembers(
        response?.members || []
      );
    } catch (error) {
      console.error(
        "Failed to update member role:",
        error
      );

      setFormError(
        error.response?.data?.message ||
          "Failed to update member role."
      );
    }
  };

  /* ==========================================================
     LOADING STATE
  ========================================================== */

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="px-8 py-10 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-brand)]" />

            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              Loading workspaces...
            </p>
          </Card>
        </div>
      </MainLayout>
    );
  }

  /* ==========================================================
     EMPTY STATE
  ========================================================== */

  if (!selectedWorkspace) {
    return (
      <MainLayout>
        <Card className="mx-auto max-w-xl text-center">
          <FiLayers
            className="mx-auto text-[var(--color-brand)]"
            size={32}
          />

          <h1 className="mt-4 text-xl font-semibold">
            Create your first workspace
          </h1>

          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Workspaces help keep teams, projects,
            and planning in one focused place.
          </p>

          {formError && (
            <p className="mt-4 rounded-lg bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]">
              {formError}
            </p>
          )}

          <Button
            className="mt-6"
            onClick={() =>
              openWorkspaceDialog("create")
            }
          >
            <FiPlus size={17} />
            Create workspace
          </Button>
        </Card>

        {dialog === "create" && (
          <Dialog
            title="Create workspace"
            onClose={closeDialog}
          >
            <form
              onSubmit={submitWorkspace}
              className="space-y-4"
            >
              <Input
                id="workspace-name"
                label="Workspace name"
                value={formValues.name}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                error={formError}
                autoFocus
              />

              <div>
                <label
                  htmlFor="workspace-description"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Description
                </label>

                <textarea
                  id="workspace-description"
                  value={formValues.description}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      description:
                        event.target.value,
                    }))
                  }
                  rows={4}
                  className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                  placeholder="What will this workspace help your team accomplish?"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeDialog}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                >
                  <FiCheck size={16} />

                  {isSubmitting
                    ? "Creating..."
                    : "Create workspace"}
                </Button>
              </div>
            </form>
          </Dialog>
        )}
      </MainLayout>
    );
  }

  /* ==========================================================
     MAIN PAGE
  ========================================================== */

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader
          title="Workspaces"
          description="Organize the people and planning spaces that move your work forward."
          actions={
            <Button
              onClick={() =>
                openWorkspaceDialog("create")
              }
            >
              <FiPlus
                size={17}
                aria-hidden="true"
              />
              Create workspace
            </Button>
          }
        />

        {formError && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-danger)]">
            <FiAlertTriangle
              size={18}
              className="mt-0.5 shrink-0"
            />

            <p>{formError}</p>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          {/* WORKSPACE LIST */}

          <Card className="h-fit p-3 sm:p-4">
            <div className="flex items-center justify-between px-2 pb-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                Your workspaces
              </h2>

              <span className="rounded-full bg-[var(--color-surface-sage)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-hover)]">
                {workspaces.length}
              </span>
            </div>

            <div className="space-y-1.5">
              {workspaces.map((workspace) => {
                const isSelected =
                  workspace.id ===
                  selectedWorkspaceId;

                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() =>
                      setSelectedWorkspaceId(
                        workspace.id
                      )
                    }
                    className={`group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition ${
                      isSelected
                        ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)] shadow-[var(--shadow-xs)]"
                        : "text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)]"
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--color-brand)] shadow-[var(--shadow-xs)]">
                      <FiLayers size={17} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {workspace.name}
                      </span>

                      <span className="mt-0.5 block text-xs text-[var(--color-text-subtle)]">
                        {isSelected
                          ? `${selectedWorkspaceMembers.length} members`
                          : "Workspace"}
                      </span>
                    </span>

                    <FiChevronRight
                      size={16}
                      className="opacity-50"
                    />
                  </button>
                );
              })}
            </div>

            <Button
              variant="soft"
              className="mt-4 w-full"
              onClick={() =>
                openWorkspaceDialog("create")
              }
            >
              <FiPlus size={16} />
              New workspace
            </Button>
          </Card>

          {/* SELECTED WORKSPACE */}

          <div className="min-w-0 space-y-5">
            <Card className="overflow-hidden p-0">
              <div className="bg-[linear-gradient(135deg,var(--color-surface-sage),var(--color-surface)_58%,var(--color-info-soft))] p-5 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          roleClasses[currentRole] ||
                          roleClasses.Member
                        }`}
                      >
                        {currentRole ||
                          "Member"}
                      </span>

                      <span className="text-xs font-medium text-[var(--color-text-subtle)]">
                        Your workspace role
                      </span>
                    </div>

                    <h2 className="mt-4 font-[var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)] sm:text-3xl">
                      {selectedWorkspace.name}
                    </h2>

                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)] sm:text-base">
                      {selectedWorkspace.description ||
                        "No description provided."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEditWorkspace && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          openWorkspaceDialog(
                            "edit"
                          )
                        }
                      >
                        <FiEdit2 size={16} />
                        Edit
                      </Button>
                    )}

                    {canEditWorkspace && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDialog("delete")
                        }
                        className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                      >
                        <FiTrash2 size={16} />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 border-t border-[var(--color-border)] p-5 text-sm sm:grid-cols-3 sm:px-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                    Owner
                  </p>

                  <p className="mt-1 font-medium text-[var(--color-text)]">
                    {selectedWorkspaceMembers.find(
                      (member) =>
                        member.workspaceRole ===
                        "Owner"
                    )?.firstName || "Unknown"}{" "}
                    {selectedWorkspaceMembers.find(
                      (member) =>
                        member.workspaceRole ===
                        "Owner"
                    )?.lastName || ""}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                    Created
                  </p>

                  <p className="mt-1 font-medium text-[var(--color-text)]">
                    {formatDate(
                      selectedWorkspace.createdAt
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">
                    Members
                  </p>

                  <p className="mt-1 font-medium text-[var(--color-text)]">
                    {selectedWorkspaceMembers.length}{" "}
                    people
                  </p>
                </div>
              </div>
            </Card>

            {/* MEMBERS */}

            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-info-soft)] text-[var(--color-info)]">
                      <FiUsers size={18} />
                    </span>

                    <div>
                      <h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">
                        Members
                      </h2>

                      <p className="text-sm text-[var(--color-text-muted)]">
                        Everyone with access to this
                        workspace.
                      </p>
                    </div>
                  </div>
                </div>

                {canManageMembers && (
                  <Button
                    variant="soft"
                    onClick={() =>
                      setDialog("addMember")
                    }
                    disabled
                    title="User search endpoint is required"
                  >
                    <FiUserPlus size={16} />
                    Add member
                  </Button>
                )}
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-sm">
                  <thead className="border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">
                    <tr>
                      <th className="pb-3 pr-4">
                        Member
                      </th>

                      <th className="pb-3 pr-4">
                        Global role
                      </th>

                      <th className="pb-3 pr-4">
                        Workspace role
                      </th>

                      <th className="pb-3 pr-4">
                        Joined
                      </th>

                      <th className="pb-3 text-right">
                        <span className="sr-only">
                          Actions
                        </span>
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[var(--color-border)]">
                    {selectedWorkspaceMembers.length ===
                    0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-10 text-center text-sm text-[var(--color-text-muted)]"
                        >
                          No members found.
                        </td>
                      </tr>
                    ) : (
                      selectedWorkspaceMembers.map(
                        (member) => {
                          const isOwner =
                            member.workspaceRole ===
                            "Owner";

                          const firstInitial =
                            member.firstName
                              ?.charAt(0)
                              ?.toUpperCase() || "";

                          const lastInitial =
                            member.lastName
                              ?.charAt(0)
                              ?.toUpperCase() || "";

                          return (
                            <tr key={member.id}>
                              <td className="py-4 pr-4">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)]">
                                    {firstInitial}
                                    {lastInitial}
                                  </span>

                                  <span>
                                    <span className="block font-semibold text-[var(--color-text)]">
                                      {member.firstName}{" "}
                                      {member.lastName}
                                    </span>

                                    <span className="block text-xs text-[var(--color-text-subtle)]">
                                      {member.email}
                                    </span>
                                  </span>
                                </div>
                              </td>

                              <td className="py-4 pr-4 text-[var(--color-text-muted)]">
                                {member.globalRole ||
                                  "Member"}
                              </td>

                              <td className="py-4 pr-4">
                                {canManageRoles &&
                                !isOwner ? (
                                  <select
                                    value={
                                      member.workspaceRole
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      handleChangeMemberRole(
                                        member.id,
                                        event.target.value
                                      )
                                    }
                                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                                  >
                                    <option value="Admin">
                                      Admin
                                    </option>

                                    <option value="Member">
                                      Member
                                    </option>
                                  </select>
                                ) : (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      roleClasses[
                                        member.workspaceRole
                                      ] ||
                                      roleClasses.Member
                                    }`}
                                  >
                                    {
                                      member.workspaceRole
                                    }
                                  </span>
                                )}
                              </td>

                              <td className="py-4 pr-4 text-[var(--color-text-muted)]">
                                {formatDate(
                                  member.joinedAt
                                )}
                              </td>

                              <td className="py-4 text-right">
                                {canManageMembers &&
                                  !isOwner && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDialog({
                                          type: "remove",
                                          member,
                                        })
                                      }
                                      className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                                      aria-label={`Remove ${member.firstName} ${member.lastName}`}
                                    >
                                      <FiUserMinus
                                        size={17}
                                      />
                                    </button>
                                  )}
                              </td>
                            </tr>
                          );
                        }
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </section>
      </div>

      {/* ======================================================
          CREATE / EDIT WORKSPACE
      ====================================================== */}

      {(dialog === "create" ||
        dialog === "edit") && (
        <Dialog
          title={
            dialog === "create"
              ? "Create workspace"
              : "Edit workspace"
          }
          onClose={closeDialog}
        >
          <form
            onSubmit={submitWorkspace}
            className="space-y-4"
          >
            <Input
              id="workspace-name"
              label="Workspace name"
              value={formValues.name}
              onChange={(event) =>
                setFormValues((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              error={formError}
              autoFocus
            />

            <div>
              <label
                htmlFor="workspace-description"
                className="mb-2 block text-sm font-medium text-[var(--color-text)]"
              >
                Description
              </label>

              <textarea
                id="workspace-description"
                value={formValues.description}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }))
                }
                rows={4}
                className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"
                placeholder="What will this workspace help your team accomplish?"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={closeDialog}
                disabled={isSubmitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
              >
                <FiCheck size={16} />

                {isSubmitting
                  ? dialog === "create"
                    ? "Creating..."
                    : "Saving..."
                  : dialog === "create"
                  ? "Create workspace"
                  : "Save changes"}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ======================================================
          ADD MEMBER
      ====================================================== */}

      {dialog === "addMember" && (
        <Dialog
          title="Add a member"
          onClose={closeDialog}
        >
          <div className="rounded-[var(--radius-md)] bg-[var(--color-info-soft)] p-4 text-sm text-[var(--color-text)]">
            <p className="font-semibold">
              User selection is not connected yet.
            </p>

            <p className="mt-1 text-[var(--color-text-muted)]">
              A real user-list/search API is required
              before members can be selected here.
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              variant="secondary"
              onClick={closeDialog}
            >
              Close
            </Button>
          </div>
        </Dialog>
      )}

      {/* ======================================================
          REMOVE MEMBER
      ====================================================== */}

      {dialog?.type === "remove" && (
        <Dialog
          title="Remove member"
          onClose={closeDialog}
        >
          <div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]">
            <FiAlertTriangle
              className="mt-0.5 shrink-0 text-[var(--color-danger)]"
              size={19}
            />

            <p>
              Remove{" "}
              <strong>
                {dialog.member.firstName}{" "}
                {dialog.member.lastName}
              </strong>{" "}
              from this workspace? They will lose
              access to its projects and tasks.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={() =>
                handleRemoveMember(
                  dialog.member.id
                )
              }
              disabled={isSubmitting}
              className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"
            >
              <FiUserMinus size={16} />

              {isSubmitting
                ? "Removing..."
                : "Remove member"}
            </Button>
          </div>
        </Dialog>
      )}

      {/* ======================================================
          DELETE WORKSPACE
      ====================================================== */}

      {dialog === "delete" && (
        <Dialog
          title="Delete workspace"
          onClose={closeDialog}
        >
          <div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]">
            <FiAlertTriangle
              className="mt-0.5 shrink-0 text-[var(--color-danger)]"
              size={19}
            />

            <p>
              Delete{" "}
              <strong>
                {selectedWorkspace.name}
              </strong>
              ? This action will remove the workspace
              from the system.
            </p>
          </div>

          {formError && (
            <p className="mt-4 text-sm text-[var(--color-danger)]">
              {formError}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDialog}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleDeleteWorkspace}
              disabled={isSubmitting}
              className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"
            >
              <FiTrash2 size={16} />

              {isSubmitting
                ? "Deleting..."
                : "Delete workspace"}
            </Button>
          </div>
        </Dialog>
      )}
    </MainLayout>
  );
}

export default Workspaces;