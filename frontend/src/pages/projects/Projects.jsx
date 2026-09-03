import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiArchive, FiArrowDown, FiArrowUp, FiCheck, FiChevronRight, FiEdit2, FiFolder, FiPlus, FiShield, FiUserMinus, FiUserPlus, FiX } from "react-icons/fi";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import { initialProjects, projectOptions, projectUsers, projectWorkspaces } from "../../data/projectMockData";
import MainLayout from "../../layouts/MainLayout";
import { getWorkspaces } from "../../services/api/workspaceApi";
import {
  getProjects,
  createProject as createProjectApi,
  updateProject as updateProjectApi,
  archiveProject as archiveProjectApi,
  addProjectMember as addProjectMemberApi,
  getProjectMembers,
  updateProjectMemberRole,
  removeProjectMember as removeProjectMemberApi,
} from "../../services/api/projectApi";

import {
  getProjectRisks,
  createRisk as createRiskApi,
  updateRisk as updateRiskApi,
  closeRisk as closeRiskApi,
} from "../../services/api/riskApi";

const priorityClasses = { Low: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]", Medium: "bg-[var(--color-info-soft)] text-[var(--color-info)]", High: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]", Critical: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" };
const statusClasses = { Planning: "bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]", "In Progress": "bg-[var(--color-info-soft)] text-[var(--color-info)]", "On Track": "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]", "At Risk": "bg-[var(--color-peach-soft)] text-[var(--color-peach)]", Complete: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]", Open: "bg-[var(--color-peach-soft)] text-[var(--color-peach)]", Closed: "bg-[var(--color-surface-sage)] text-[var(--color-brand-hover)]" };
const severityRank = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const probabilityRank = { Low: 1, Medium: 2, High: 3 };
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
const emptyProjectForm = { title: "", description: "", category: "Product", priority: "Medium", status: "Planning", startDate: "", endDate: "" };
const emptyRiskForm = { title: "", description: "", severity: "Medium", probability: "Medium", ownerId: "user-geethika", mitigationPlan: "" };

function Dialog({ children, onClose, title, wide = false }) {
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(52_67_51/0.22)] p-3 backdrop-blur-sm sm:items-center sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" className={`max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-lg)] sm:max-h-[calc(100vh-2.5rem)] sm:p-7 ${wide ? "max-w-6xl" : "max-w-xl"}`}><div className="mb-5 flex items-start justify-between gap-4"><h2 id="project-dialog-title" className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">{title}</h2><button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]"><FiX size={19} /></button></div>{children}</section></div>;
}

function FieldSelect({ children, id, label, value, onChange }) {
  return <label className="block text-sm font-medium text-[var(--color-text)]">{label}<select id={id} value={value} onChange={onChange} className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]">{children}</select></label>;
}

function Projects() {
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [riskForm, setRiskForm] = useState(emptyRiskForm);
  const [formError, setFormError] = useState("");
  const [riskSort, setRiskSort] = useState({ key: "severity", direction: "desc" });
  const [memberUserId, setMemberUserId] = useState("user-noah");

  const workspace = workspaces.find((item) => item.id === workspaceId);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const canManage = workspace?.currentUserRole === "Owner" || workspace?.currentUserRole === "Admin";
  const visibleProjects = projects.filter((project) => project.workspaceId === workspaceId && (includeArchived || !project.isArchived));
  const getUser = (id) => projectUsers.find((user) => user.id === id);
  const closeDialog = () => { setDialog(null); setFormError(""); };
  const openProjectForm = (mode) => { setProjectForm(mode === "edit" ? { title: selectedProject.title, description: selectedProject.description, category: selectedProject.category, priority: selectedProject.priority, status: selectedProject.status, startDate: selectedProject.startDate, endDate: selectedProject.endDate } : emptyProjectForm); setFormError(""); setDialog(mode); };
  const updateProjectForm = (field, value) => setProjectForm((current) => ({ ...current, [field]: value }));
  const saveProject = (event) => {
    event.preventDefault();
    if (!projectForm.title.trim()) { setFormError("Project title is required."); return; }
    if (projectForm.startDate && projectForm.endDate && projectForm.endDate < projectForm.startDate) { setFormError("End date must be on or after the start date."); return; }
    if (dialog === "create") {
      const id = `project-${Date.now()}`;
      setProjects((current) => [...current, { ...projectForm, id, title: projectForm.title.trim(), description: projectForm.description.trim(), workspaceId, managerId: "user-geethika", isArchived: false, createdAt: today(), members: [{ userId: "user-geethika", role: "Manager" }], risks: [] }]);
      setSelectedProjectId(id);
    } else {
      setProjects((current) => current.map((project) => project.id === selectedProject.id ? { ...project, ...projectForm, title: projectForm.title.trim(), description: projectForm.description.trim() } : project));
    }
    closeDialog();
  };
  const archiveProject = () => { setProjects((current) => current.map((project) => project.id === selectedProject.id ? { ...project, isArchived: true } : project)); setSelectedProjectId(null); closeDialog(); };
  const updateSelectedProject = (updater) => setProjects((current) => current.map((project) => project.id === selectedProject.id ? updater(project) : project));
  const addMember = () => { if (!selectedProject.members.some((member) => member.userId === memberUserId)) updateSelectedProject((project) => ({ ...project, members: [...project.members, { userId: memberUserId, role: "Contributor" }] })); closeDialog(); };
  const removeMember = (userId) => { updateSelectedProject((project) => ({ ...project, members: project.members.filter((member) => member.userId !== userId) })); closeDialog(); };
  const setMemberRole = (userId, role) => updateSelectedProject((project) => ({ ...project, members: project.members.map((member) => member.userId === userId ? { ...member, role } : member) }));
  const saveRisk = (event) => { event.preventDefault(); if (!riskForm.title.trim()) { setFormError("Risk title is required."); return; } const id = `risk-${Date.now()}`; updateSelectedProject((project) => ({ ...project, risks: [...project.risks, { ...riskForm, id, title: riskForm.title.trim(), description: riskForm.description.trim(), mitigationPlan: riskForm.mitigationPlan.trim(), status: "Open", createdAt: today() }] })); closeDialog(); };
  const updateRisk = (event) => { event.preventDefault(); if (!riskForm.title.trim()) { setFormError("Risk title is required."); return; } updateSelectedProject((project) => ({ ...project, risks: project.risks.map((risk) => risk.id === dialog.risk.id ? { ...risk, ...riskForm, title: riskForm.title.trim(), description: riskForm.description.trim(), mitigationPlan: riskForm.mitigationPlan.trim() } : risk) })); closeDialog(); };
  const closeRisk = () => { updateSelectedProject((project) => ({ ...project, risks: project.risks.map((risk) => risk.id === dialog.risk.id ? { ...risk, status: "Closed" } : risk) })); closeDialog(); };
  const sortedRisks = useMemo(() => { if (!selectedProject) return []; const getValue = (risk) => riskSort.key === "severity" ? severityRank[risk.severity] : riskSort.key === "probability" ? probabilityRank[risk.probability] : riskSort.key === "status" ? risk.status : risk.createdAt; return [...selectedProject.risks].sort((a, b) => { const left = getValue(a); const right = getValue(b); const comparison = left > right ? 1 : left < right ? -1 : 0; return riskSort.direction === "asc" ? comparison : -comparison; }); }, [selectedProject, riskSort]);
  const changeRiskSort = (key) => setRiskSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "desc" });
  const addableUsers = selectedProject ? projectUsers.filter((user) => !selectedProject.members.some((member) => member.userId === user.id)) : [];
  const loadWorkspaces = async () => {
  try {
    const response = await getWorkspaces();

    setWorkspaces(response.workspaces || []);

    if (response.workspaces?.length > 0) {
      setWorkspaceId(response.workspaces[0].id);
    }
  } catch (error) {
    console.error("Failed to load workspaces:", error);

    setFormError(
      error.response?.data?.message ||
      "Failed to load workspaces."
    );
  }
};

  useEffect(() => {
    loadWorkspaces();
  }, []);
  const loadProjects = async () => {
  try {
    setFormError("");

    const response = await getProjects(workspaceId);

    const normalizedProjects = response.projects.map((project) => ({
      ...project,
      workspaceId: project.workspace_id,
      managerId: project.manager_id,
      isArchived: project.is_archived,
      startDate: project.start_date
        ? project.start_date.slice(0, 10)
        : "",
      endDate: project.end_date
        ? project.end_date.slice(0, 10)
        : "",
      createdAt: project.created_at,
      members: [],
      risks: [],
    }));

    setProjects(normalizedProjects);
  } catch (error) {
    console.error("Failed to load projects:", error)
    setFormError(
      error.response?.data?.message ||
      "Failed to load projects."
    );
  }
};
useEffect(() => {
  if(workspaceId){
    loadProjects()
  }
}, [workspaceId]);
if (!workspaceId || !workspace) {
  return (
    <MainLayout>
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          Loading workspace...
        </p>
      </div>
    </MainLayout>
  );
}
  return <MainLayout><div className="space-y-6 sm:space-y-8"><PageHeader title="Projects" description="Plan focused work, keep collaborators aligned, and surface risks before they slow the team down." actions={canManage && <Button onClick={() => openProjectForm("create")}><FiPlus size={17} /> Create project</Button>} />
    <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_78%,transparent)] p-4 shadow-[var(--shadow-xs)] sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Workspace</p><h2 className="mt-1 font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">{workspace.name || "Loading workspace"}</h2></div><div className="flex flex-wrap items-center gap-3"><label className="sr-only" htmlFor="project-workspace">Select workspace</label><select id="project-workspace" value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); setSelectedProjectId(null); }} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_15%,transparent)]">{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-text-muted)]"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" /> Show archived</label><span className="rounded-full bg-[var(--color-info-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-info)]">{workspace.currentUserRole} preview</span></div></section>
    {visibleProjects.length ? <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleProjects.map((project) => { const manager = getUser(project.managerId); return <Card key={project.id} hoverable className="flex min-h-[16rem] cursor-pointer flex-col p-5" onClick={() => setSelectedProjectId(project.id)}><div className="flex items-start justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-sage)] text-[var(--color-brand)]"><FiFolder size={19} /></span><div className="flex flex-wrap justify-end gap-1.5"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${priorityClasses[project.priority]}`}>{project.priority}</span>{project.isArchived && <span className="rounded-full bg-[var(--color-surface-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-text-muted)]">Archived</span>}</div></div><h2 className="mt-5 font-[var(--font-display)] text-xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">{project.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{project.description || "No project description yet."}</p><div className="mt-auto pt-5"><div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-subtle)]"><span>{project.category}</span><span>{project.startDate ? `${formatDate(project.startDate)} – ${formatDate(project.endDate)}` : "Dates to be planned"}</span></div><div className="mt-3 flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[project.status]}`}>{project.status}</span><span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">{manager?.name}<FiChevronRight size={15} /></span></div></div></Card>; })}</section> : <Card className="py-14 text-center"><FiFolder className="mx-auto text-[var(--color-brand)]" size={32} /><h2 className="mt-4 font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">No active projects yet</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-text-muted)]">Create a project to bring plans, people, and risks into one clear place.</p>{canManage && <Button className="mt-6" onClick={() => openProjectForm("create")}><FiPlus size={16} /> Create project</Button>}</Card>}
  </div>

  {(dialog === "create" || dialog === "edit") && <Dialog title={dialog === "create" ? "Create project" : "Edit project"} onClose={closeDialog}><form onSubmit={saveProject} className="space-y-4"><Input id="project-title" label="Project title" value={projectForm.title} onChange={(event) => updateProjectForm("title", event.target.value)} error={formError} autoFocus /><label className="block text-sm font-medium text-[var(--color-text)]">Description<textarea value={projectForm.description} onChange={(event) => updateProjectForm("description", event.target.value)} rows={3} className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]" /></label><div className="grid gap-4 sm:grid-cols-3"><FieldSelect id="project-category" label="Category" value={projectForm.category} onChange={(event) => updateProjectForm("category", event.target.value)}>{projectOptions.categories.map((item) => <option key={item}>{item}</option>)}</FieldSelect><FieldSelect id="project-priority" label="Priority" value={projectForm.priority} onChange={(event) => updateProjectForm("priority", event.target.value)}>{projectOptions.priorities.map((item) => <option key={item}>{item}</option>)}</FieldSelect><FieldSelect id="project-status" label="Status" value={projectForm.status} onChange={(event) => updateProjectForm("status", event.target.value)}>{projectOptions.statuses.map((item) => <option key={item}>{item}</option>)}</FieldSelect></div><div className="grid gap-4 sm:grid-cols-2"><Input id="project-start" label="Start date" type="date" value={projectForm.startDate} onChange={(event) => updateProjectForm("startDate", event.target.value)} /><Input id="project-end" label="End date" type="date" value={projectForm.endDate} onChange={(event) => updateProjectForm("endDate", event.target.value)} /></div><div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit"><FiCheck size={16} /> {dialog === "create" ? "Create project" : "Save changes"}</Button></div></form></Dialog>}
  {selectedProject && <Dialog title={selectedProject.title} onClose={() => setSelectedProjectId(null)} wide><div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[selectedProject.status]}`}>{selectedProject.status}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClasses[selectedProject.priority]}`}>{selectedProject.priority}</span>{selectedProject.isArchived && <span className="rounded-full bg-[var(--color-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-muted)]">Archived</span>}</div><p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-text-muted)]">{selectedProject.description || "No project description yet."}</p><p className="mt-3 text-xs text-[var(--color-text-subtle)]">{selectedProject.category} · {selectedProject.startDate ? `${formatDate(selectedProject.startDate)} to ${formatDate(selectedProject.endDate)}` : "Dates to be planned"} · Managed by {getUser(selectedProject.managerId)?.name}</p></div>{canManage && !selectedProject.isArchived && <div className="flex shrink-0 flex-wrap gap-2"><Button variant="secondary" onClick={() => openProjectForm("edit")}><FiEdit2 size={16} /> Edit</Button><Button variant="secondary" onClick={() => setDialog("archive")} className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"><FiArchive size={16} /> Archive</Button></div>}</div>
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><Card className="p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">Project members</h3><p className="mt-1 text-sm text-[var(--color-text-muted)]">People contributing to this project.</p></div>{canManage && !selectedProject.isArchived && <Button variant="soft" onClick={() => setDialog("addMember")} disabled={!addableUsers.length}><FiUserPlus size={16} /> Add</Button>}</div><ul className="mt-5 divide-y divide-[var(--color-border)]">{selectedProject.members.map((member) => { const user = getUser(member.userId); return <li key={member.userId} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-xs font-bold text-[var(--color-brand-hover)]">{user?.name.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--color-text)]">{user?.name}</p><p className="truncate text-xs text-[var(--color-text-subtle)]">{user?.email}</p></div>{canManage && !selectedProject.isArchived ? <select aria-label={`${user?.name} project role`} value={member.role} onChange={(event) => setMemberRole(member.userId, event.target.value)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs font-semibold text-[var(--color-text)]"><option>Manager</option><option>Contributor</option></select> : <span className="text-xs font-semibold text-[var(--color-text-muted)]">{member.role}</span>}{canManage && !selectedProject.isArchived && member.role !== "Manager" && <button type="button" onClick={() => setDialog({ type: "removeMember", member, user })} className="rounded-lg p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]" aria-label={`Remove ${user?.name}`}><FiUserMinus size={16} /></button>}</li>; })}</ul></Card>
      <Card className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-peach-soft)] text-[var(--color-peach)]"><FiShield size={18} /></span><div><h3 className="font-[var(--font-display)] text-lg font-semibold text-[var(--color-text)]">Risks</h3><p className="text-sm text-[var(--color-text-muted)]">Potential blockers with clear ownership.</p></div></div></div>{canManage && !selectedProject.isArchived && <Button variant="soft" onClick={() => { setRiskForm(emptyRiskForm); setFormError(""); setDialog("createRisk"); }}><FiPlus size={16} /> Add risk</Button>}</div><div className="mt-5 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold uppercase tracking-[0.08em] text-[var(--color-text-subtle)]">Sort</span>{["severity", "probability", "status", "createdAt"].map((key) => <button key={key} type="button" onClick={() => changeRiskSort(key)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-semibold transition ${riskSort.key === key ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-hover)]" : "bg-[var(--color-canvas-soft)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]"}`}>{key === "createdAt" ? "Created" : key[0].toUpperCase() + key.slice(1)}{riskSort.key === key && (riskSort.direction === "asc" ? <FiArrowUp size={13} /> : <FiArrowDown size={13} />)}</button>)}</div>{sortedRisks.length ? <ul className="mt-4 divide-y divide-[var(--color-border)]">{sortedRisks.map((risk) => <li key={risk.id} className="py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[var(--color-text)]">{risk.title}</p><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityClasses[risk.severity]}`}>{risk.severity}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClasses[risk.status]}`}>{risk.status}</span></div><p className="mt-1 text-sm text-[var(--color-text-muted)]">{risk.description || "No description provided."}</p><p className="mt-2 text-xs text-[var(--color-text-subtle)]">Probability: {risk.probability} · Owner: {getUser(risk.ownerId)?.name} · Created {formatDate(risk.createdAt)}</p>{risk.mitigationPlan && <p className="mt-2 rounded-lg bg-[var(--color-canvas-soft)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><strong className="text-[var(--color-text)]">Mitigation:</strong> {risk.mitigationPlan}</p>}</div>{canManage && !selectedProject.isArchived && <div className="flex shrink-0 gap-1"><button type="button" onClick={() => { setRiskForm({ title: risk.title, description: risk.description, severity: risk.severity, probability: risk.probability, ownerId: risk.ownerId, mitigationPlan: risk.mitigationPlan }); setFormError(""); setDialog({ type: "editRisk", risk }); }} className="rounded-lg p-2 text-[var(--color-text-subtle)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-text)]" aria-label={`Edit ${risk.title}`}><FiEdit2 size={16} /></button>{risk.status === "Open" && <button type="button" onClick={() => setDialog({ type: "closeRisk", risk })} className="rounded-lg p-2 text-[var(--color-brand-hover)] hover:bg-[var(--color-surface-sage)]" aria-label={`Close ${risk.title}`}><FiCheck size={16} /></button>}</div>}</div></li>)}</ul> : <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] px-4 py-8 text-center"><FiShield className="mx-auto text-[var(--color-brand)]" size={24} /><p className="mt-2 text-sm font-semibold text-[var(--color-text)]">No risks recorded</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">Add a risk when the team identifies a potential blocker.</p></div>}</Card></div>
  </Dialog>}
  {dialog === "archive" && <Dialog title="Archive project" onClose={closeDialog}><div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]"><FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-danger)]" size={19} /><p>Archive <strong>{selectedProject?.title}</strong>? It will be removed from the active project list in this local session.</p></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={archiveProject} className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]"><FiArchive size={16} /> Archive project</Button></div></Dialog>}
  {dialog === "addMember" && <Dialog title="Add project member" onClose={closeDialog}><p className="text-sm text-[var(--color-text-muted)]">Choose a workspace teammate to add as a project contributor. This uses local mock data only.</p><FieldSelect id="project-member" label="Teammate" value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>{addableUsers.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</FieldSelect><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={addMember}><FiUserPlus size={16} /> Add member</Button></div></Dialog>}
  {dialog?.type === "removeMember" && <Dialog title="Remove project member" onClose={closeDialog}><div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-4 text-sm text-[var(--color-text)]"><FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-danger)]" size={19} /><p>Remove <strong>{dialog.user.name}</strong> from this project?</p></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={() => removeMember(dialog.member.userId)} className="bg-[var(--color-danger)] hover:bg-[var(--color-danger)]">Remove member</Button></div></Dialog>}
  {(dialog === "createRisk" || dialog?.type === "editRisk") && <Dialog title={dialog === "createRisk" ? "Add risk" : "Edit risk"} onClose={closeDialog}><form onSubmit={dialog === "createRisk" ? saveRisk : updateRisk} className="space-y-4"><Input id="risk-title" label="Risk title" value={riskForm.title} onChange={(event) => setRiskForm((current) => ({ ...current, title: event.target.value }))} error={formError} autoFocus /><label className="block text-sm font-medium text-[var(--color-text)]">Description<textarea value={riskForm.description} onChange={(event) => setRiskForm((current) => ({ ...current, description: event.target.value }))} rows={3} className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]" /></label><div className="grid gap-4 sm:grid-cols-3"><FieldSelect id="risk-severity" label="Severity" value={riskForm.severity} onChange={(event) => setRiskForm((current) => ({ ...current, severity: event.target.value }))}>{["Low", "Medium", "High", "Critical"].map((item) => <option key={item}>{item}</option>)}</FieldSelect><FieldSelect id="risk-probability" label="Probability" value={riskForm.probability} onChange={(event) => setRiskForm((current) => ({ ...current, probability: event.target.value }))}>{["Low", "Medium", "High"].map((item) => <option key={item}>{item}</option>)}</FieldSelect><FieldSelect id="risk-owner" label="Owner" value={riskForm.ownerId} onChange={(event) => setRiskForm((current) => ({ ...current, ownerId: event.target.value }))}>{selectedProject?.members.map((member) => { const user = getUser(member.userId); return <option key={member.userId} value={member.userId}>{user?.name}</option>; })}</FieldSelect></div><label className="block text-sm font-medium text-[var(--color-text)]">Mitigation plan<textarea value={riskForm.mitigationPlan} onChange={(event) => setRiskForm((current) => ({ ...current, mitigationPlan: event.target.value }))} rows={3} className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--color-focus)_18%,transparent)]" /></label><div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button type="submit"><FiCheck size={16} /> {dialog === "createRisk" ? "Add risk" : "Save risk"}</Button></div></form></Dialog>}
  {dialog?.type === "closeRisk" && <Dialog title="Close risk" onClose={closeDialog}><div className="flex gap-3 rounded-[var(--radius-md)] bg-[var(--color-sun-soft)] p-4 text-sm text-[var(--color-text)]"><FiAlertTriangle className="mt-0.5 shrink-0 text-[var(--color-sun)]" size={19} /><p>Mark <strong>{dialog.risk.title}</strong> as closed? This is a local mock update only.</p></div><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={closeDialog}>Cancel</Button><Button onClick={closeRisk}><FiCheck size={16} /> Close risk</Button></div></Dialog>}
  </MainLayout>;
}

export default Projects;
