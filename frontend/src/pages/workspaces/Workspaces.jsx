import { useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiChevronRight, FiEdit2, FiLayers, FiPlus, FiTrash2, FiUserMinus, FiUserPlus, FiUsers, FiX } from "react-icons/fi";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import { availableMembers, currentWorkspaceUser, initialWorkspaces } from "../../data/workspaceMockData";
import MainLayout from "../../layouts/MainLayout";

const roleClasses = {
  Owner: "bg-[var(--color-sun-soft)] text-[var(--color-sun)]",
  Admin: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  Member: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]",
};

const formatDate = (date) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`));

function Dialog({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-4 backdrop-blur-sm sm:items-center" role="presentation">
      <div className="w-full max-w-lg rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="workspace-dialog-title">
        <div className="mb-5 flex items-start justify-between gap-4"><h2 id="workspace-dialog-title" className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"><FiX size={19} /></button></div>
        {children}
      </div>
    </div>
  );
}

function Workspaces() {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0].id);
  const [rolePreview, setRolePreview] = useState("Owner");
  const [dialog, setDialog] = useState(null);
  const [formValues, setFormValues] = useState({ name: "", description: "" });
  const [formError, setFormError] = useState("");
  const [memberToAdd, setMemberToAdd] = useState(availableMembers[0].id);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || workspaces[0];
  const currentRole = rolePreview;
  const canEditWorkspace = currentRole === "Owner";
  const canManageMembers = currentRole === "Owner" || currentRole === "Admin";
  const canManageRoles = currentRole === "Owner";
  const unaddedMembers = useMemo(() => selectedWorkspace ? availableMembers.filter((member) => !selectedWorkspace.members.some((workspaceMember) => workspaceMember.id === member.id)) : [], [selectedWorkspace]);

  const closeDialog = () => { setDialog(null); setFormError(""); };
  const openWorkspaceDialog = (mode) => {
    setFormValues(mode === "edit" ? { name: selectedWorkspace.name, description: selectedWorkspace.description } : { name: "", description: "" });
    setFormError("");
    setDialog(mode);
  };
  const submitWorkspace = (event) => {
    event.preventDefault();
    const name = formValues.name.trim();
    if (!name) { setFormError("Workspace name is required."); return; }
    if (dialog === "create") {
      const id = `workspace-${Date.now()}`;
      const workspace = { id, name, description: formValues.description.trim() || "No description yet.", ownerId: currentWorkspaceUser.id, workspaceRole: "Owner", createdAt: new Date().toISOString().slice(0, 10), members: [{ id: currentWorkspaceUser.id, firstName: "Geethika", lastName: "Sai Unnam", email: "geethika@taskflow.dev", globalRole: currentWorkspaceUser.globalRole, workspaceRole: "Owner", joinedAt: new Date().toISOString().slice(0, 10) }] };
      setWorkspaces((current) => [...current, workspace]);
      setSelectedWorkspaceId(id);
      setRolePreview("Owner");
    } else {
      setWorkspaces((current) => current.map((workspace) => workspace.id === selectedWorkspace.id ? { ...workspace, name, description: formValues.description.trim() || "No description yet." } : workspace));
    }
    closeDialog();
  };
  const deleteWorkspace = () => {
    const remaining = workspaces.filter((workspace) => workspace.id !== selectedWorkspace.id);
    setWorkspaces(remaining);
    setSelectedWorkspaceId(remaining[0]?.id || "");
    closeDialog();
  };
  const addMember = () => {
    const member = availableMembers.find((candidate) => candidate.id === memberToAdd);
    if (!member) return;
    setWorkspaces((current) => current.map((workspace) => workspace.id === selectedWorkspace.id ? { ...workspace, members: [...workspace.members, { ...member, workspaceRole: "Member", joinedAt: new Date().toISOString().slice(0, 10) }] } : workspace));
    closeDialog();
  };
  const removeMember = (memberId) => {
    setWorkspaces((current) => current.map((workspace) => workspace.id === selectedWorkspace.id ? { ...workspace, members: workspace.members.filter((member) => member.id !== memberId) } : workspace));
    closeDialog();
  };
  const changeMemberRole = (memberId, workspaceRole) => setWorkspaces((current) => current.map((workspace) => workspace.id === selectedWorkspace.id ? { ...workspace, members: workspace.members.map((member) => member.id === memberId ? { ...member, workspaceRole } : member) } : workspace));

  if (!selectedWorkspace) {
    return (
      <MainLayout>
        <Card className="mx-auto max-w-xl text-center"><FiLayers className="mx-auto text-[var(--color-brand)]" size={32} /><h1 className="mt-4 text-xl font-semibold">Create your first workspace</h1><p className="mt-2 text-sm text-[var(--color-text-muted)]">Workspaces help keep teams, projects, and planning in one focused place.</p><Button className="mt-6" onClick={() => openWorkspaceDialog("create")}><FiPlus size={17} /> Create workspace</Button></Card>
        {dialog === "create" && <Dialog title="Create workspace" onClose={closeDialog}><form onSubmit={submitWorkspace} className="space-y-4"><Input id="workspace-name" label="Workspace name" value={formValues.name} onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))} error={formError} autoFocus /><div><label htmlFor="workspace-description" className="mb-2 block text-sm font-medium text-[var(--color-text)]">Description</label><textarea id="workspace-description" value={formValues.description} onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]" /></div><div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit"><FiCheck size={16} /> Create workspace</Button></div></form></Dialog>}
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8">
        <PageHeader title="Workspaces" description="Organize the people and planning spaces that move your work forward." actions={<Button onClick={() => openWorkspaceDialog("create")}><FiPlus size={17} aria-hidden="true" /> Create workspace</Button>} />

        <section className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <Card className="h-fit p-3 sm:p-4">
            <div className="flex items-center justify-between px-2 pb-3"><h2 className="text-sm font-semibold text-[var(--color-text)]">Your workspaces</h2><span className="rounded-full bg-[var(--color-surface-sage)] px-2 py-0.5 text-xs font-semibold text-[var(--color-brand-hover)]">{workspaces.length}</span></div>
            <div className="space-y-1.5">{workspaces.map((workspace) => <button key={workspace.id} type="button" onClick={() => { setSelectedWorkspaceId(workspace.id); setRolePreview(workspace.workspaceRole); }} className={`group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left transition ${workspace.id === selectedWorkspace.id ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)] shadow-[var(--shadow-xs)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-canvas-soft)]"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--color-brand)] shadow-[var(--shadow-xs)]"><FiLayers size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{workspace.name}</span><span className="mt-0.5 block text-xs text-[var(--color-text-subtle)]">{workspace.members.length} members</span></span><FiChevronRight size={16} className="opacity-50" /></button>)}</div>
            <Button variant="soft" className="mt-4 w-full" onClick={() => openWorkspaceDialog("create")}><FiPlus size={16} /> New workspace</Button>
          </Card>

          <div className="min-w-0 space-y-5">
            <Card className="overflow-hidden p-0"><div className="bg-[linear-gradient(135deg,var(--color-surface-sage),var(--color-surface)_58%,var(--color-info-soft))] p-5 sm:p-7"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="max-w-2xl"><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${roleClasses[currentRole]}`}>{currentRole}</span><span className="text-xs font-medium text-[var(--color-text-subtle)]">Your workspace role</span></div><h2 className="mt-4 font-[var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)] sm:text-3xl">{selectedWorkspace.name}</h2><p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)] sm:text-base">{selectedWorkspace.description}</p></div><div className="flex flex-wrap gap-2">{canEditWorkspace && <Button variant="secondary" onClick={() => openWorkspaceDialog("edit")}><FiEdit2 size={16} /> Edit</Button>}{canEditWorkspace && <Button variant="secondary" onClick={() => setDialog("delete")} className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"><FiTrash2 size={16} /> Delete</Button>}</div></div></div><div className="grid gap-3 border-t border-[var(--color-border)] p-5 text-sm sm:grid-cols-3 sm:px-7"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Owner</p><p className="mt-1 font-medium text-[var(--color-text)]">{selectedWorkspace.members.find((member) => member.workspaceRole === "Owner")?.firstName} {selectedWorkspace.members.find((member) => member.workspaceRole === "Owner")?.lastName}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Created</p><p className="mt-1 font-medium text-[var(--color-text)]">{formatDate(selectedWorkspace.createdAt)}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Members</p><p className="mt-1 font-medium text-[var(--color-text)]">{selectedWorkspace.members.length} people</p></div></div></Card>

            <Card className="p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-info-soft)] text-[var(--color-info)]"><FiUsers size={18} /></span><div><h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Members</h2><p className="text-sm text-[var(--color-text-muted)]">Everyone with access to this workspace.</p></div></div></div>{canManageMembers && <Button variant="soft" onClick={() => setDialog("addMember")} disabled={unaddedMembers.length === 0}><FiUserPlus size={16} /> Add member</Button>}</div>
              <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]"><tr><th className="pb-3 pr-4">Member</th><th className="pb-3 pr-4">Global role</th><th className="pb-3 pr-4">Workspace role</th><th className="pb-3 pr-4">Joined</th><th className="pb-3 text-right"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-[var(--color-border)]">{selectedWorkspace.members.map((member) => { const isOwner = member.workspaceRole === "Owner"; return <tr key={member.id}><td className="py-4 pr-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)]">{member.firstName[0]}{member.lastName[0]}</span><span><span className="block font-semibold text-[var(--color-text)]">{member.firstName} {member.lastName}</span><span className="block text-xs text-[var(--color-text-subtle)]">{member.email}</span></span></div></td><td className="py-4 pr-4 text-[var(--color-text-muted)]">{member.globalRole}</td><td className="py-4 pr-4">{canManageRoles && !isOwner ? <select value={member.workspaceRole} onChange={(event) => changeMemberRole(member.id, event.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]"><option>Admin</option><option>Member</option></select> : <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${roleClasses[member.workspaceRole]}`}>{member.workspaceRole}</span>}</td><td className="py-4 pr-4 text-[var(--color-text-muted)]">{formatDate(member.joinedAt)}</td><td className="py-4 text-right">{canManageMembers && !isOwner && <button type="button" onClick={() => setDialog({ type: "remove", member })} className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" aria-label={`Remove ${member.firstName} ${member.lastName}`}><FiUserMinus size={17} /></button>}</td></tr>; })}</tbody></table></div>
            </Card>

            <Card className="flex flex-col gap-3 border-dashed bg-[var(--color-canvas-soft)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-[var(--color-text)]">Preview workspace permissions</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">This mock-only control demonstrates the role-aware interface. The backend will enforce permissions later.</p></div><label className="sr-only" htmlFor="role-preview">Preview role</label><select id="role-preview" value={rolePreview} onChange={(event) => setRolePreview(event.target.value)} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]"><option>Owner</option><option>Admin</option><option>Member</option></select></Card>
          </div>
        </section>
      </div>

      {(dialog === "create" || dialog === "edit") && <Dialog title={dialog === "create" ? "Create workspace" : "Edit workspace"} onClose={closeDialog}><form onSubmit={submitWorkspace} className="space-y-4"><Input id="workspace-name" label="Workspace name" value={formValues.name} onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))} error={formError} autoFocus /><div><label htmlFor="workspace-description" className="mb-2 block text-sm font-medium text-[var(--color-text)]">Description</label><textarea id="workspace-description" value={formValues.description} onChange={(event) => setFormValues((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]" placeholder="What will this workspace help your team accomplish?" /></div><div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit"><FiCheck size={16} /> {dialog === "create" ? "Create workspace" : "Save changes"}</Button></div></form></Dialog>}
      {dialog === "addMember" && <Dialog title="Add a member" onClose={closeDialog}><p className="text-sm text-[var(--color-text-muted)]">Select a teammate to add as a workspace member. This is local mock data only.</p><label htmlFor="member-select" className="mt-5 mb-2 block text-sm font-medium text-[var(--color-text)]">Team member</label><select id="member-select" value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)} className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]">{unaddedMembers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} — {member.email}</option>)}</select><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={addMember}><FiUserPlus size={16} /> Add member</Button></div></Dialog>}
      {dialog?.type === "remove" && <Dialog title="Remove member" onClose={closeDialog}><div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]"><FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-danger)]" size={19} /><p>Remove <strong>{dialog.member.firstName} {dialog.member.lastName}</strong> from this workspace? They will lose access to its projects and tasks.</p></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={() => removeMember(dialog.member.id)} className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]">Remove member</Button></div></Dialog>}
      {dialog === "delete" && <Dialog title="Delete workspace" onClose={closeDialog}><div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]"><FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-danger)]" size={19} /><p>This removes <strong>{selectedWorkspace.name}</strong> from this local session. Backend deletion will be connected later.</p></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={deleteWorkspace} className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"><FiTrash2 size={16} /> Delete workspace</Button></div></Dialog>}
    </MainLayout>
  );
}

export default Workspaces;
