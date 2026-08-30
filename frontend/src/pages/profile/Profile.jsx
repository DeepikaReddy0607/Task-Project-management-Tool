import { useState } from "react";
import { Link } from "react-router-dom";
import { FiCamera, FiCheckCircle, FiEdit2, FiKey, FiMail, FiPhone, FiSave, FiUser, FiX } from "react-icons/fi";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import { initialProfile } from "../../data/profileMockData";
import MainLayout from "../../layouts/MainLayout";

const initialsFor = ({ firstName, lastName }) => `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase();

function Avatar({ profile, size = "lg" }) {
  const sizeClass = size === "lg" ? "h-24 w-24 text-2xl" : "h-10 w-10 text-sm";
  return profile.profilePicture ? <img src={profile.profilePicture} alt={`${profile.firstName} ${profile.lastName}`} className={`${sizeClass} rounded-full object-cover ring-4 ring-white shadow-[var(--shadow-sm)]`} /> : <span className={`flex ${sizeClass} items-center justify-center rounded-full bg-[var(--color-surface-sage)] font-bold text-[var(--color-brand-hover)] ring-4 ring-white shadow-[var(--shadow-sm)]`} aria-hidden="true">{initialsFor(profile)}</span>;
}

function Profile() {
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(initialProfile);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [errors, setErrors] = useState({});

  const beginEditing = () => { setDraft(profile); setErrors({}); setSaveState(""); setIsEditing(true); };
  const cancelEditing = () => { setDraft(profile); setErrors({}); setIsEditing(false); };
  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const selectPicture = (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErrors((current) => ({ ...current, profilePicture: "Choose an image file for your profile picture." })); return; }
    const reader = new FileReader();
    reader.onload = () => { updateDraft("profilePicture", reader.result); setErrors((current) => ({ ...current, profilePicture: "" })); };
    reader.onerror = () => setErrors((current) => ({ ...current, profilePicture: "We could not preview that image. Please choose another file." }));
    reader.readAsDataURL(file);
  };
  const saveProfile = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!draft.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!draft.lastName.trim()) nextErrors.lastName = "Last name is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setIsSaving(true);
    setSaveState("");
    window.setTimeout(() => {
      setProfile({ ...draft, firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), phone: draft.phone.trim() });
      setIsSaving(false);
      setIsEditing(false);
      setSaveState("success");
    }, 450);
  };

  return <MainLayout><div className="space-y-6 sm:space-y-8"><PageHeader title="Profile" description="Manage your personal details and account preferences." actions={<Link to="/profile/change-password"><Button variant="secondary"><FiKey size={16} /> Change password</Button></Link>} />
    {saveState === "success" && <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface-sage)] px-4 py-3 text-sm text-[var(--color-brand-hover)]" role="status"><FiCheckCircle size={18} aria-hidden="true" /><span><strong>Profile saved.</strong> Your local preview has been updated.</span></div>}
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.7fr)]"><Card className="p-5 sm:p-7"><div className="flex flex-col gap-5 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-4"><Avatar profile={isEditing ? draft : profile} /><div><h2 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text)]">{profile.firstName} {profile.lastName}</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">{profile.email}</p><span className="mt-3 inline-flex rounded-full bg-[var(--color-info-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--color-info)]">{profile.role}</span></div></div>{!isEditing && <Button variant="secondary" onClick={beginEditing}><FiEdit2 size={16} /> Edit profile</Button>}</div>
      {isEditing ? <form className="mt-6 space-y-5" onSubmit={saveProfile} noValidate><div className="flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-canvas-soft)] p-4 sm:flex-row sm:items-center"><Avatar profile={draft} size="sm" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--color-text)]">Profile picture</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">Choose an image to preview it locally before saving.</p>{errors.profilePicture && <p className="mt-1 text-xs text-[var(--color-danger)]" role="alert">{errors.profilePicture}</p>}</div><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:bg-white"><FiCamera size={16} /> Choose image<input type="file" accept="image/*" className="sr-only" onChange={selectPicture} /></label></div><div className="grid gap-4 sm:grid-cols-2"><Input id="firstName" label="First name" autoComplete="given-name" value={draft.firstName} onChange={(event) => updateDraft("firstName", event.target.value)} error={errors.firstName} /><Input id="lastName" label="Last name" autoComplete="family-name" value={draft.lastName} onChange={(event) => updateDraft("lastName", event.target.value)} error={errors.lastName} /></div><Input id="phone" label="Phone number" type="tel" autoComplete="tel" placeholder="Add a phone number" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} helperText="Optional. Used only in this local profile preview." /><div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas-soft)] p-4 text-sm"><p className="font-semibold text-[var(--color-text)]">Read-only account details</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><span className="flex items-center gap-2 text-[var(--color-text-muted)]"><FiMail size={16} /> {profile.email}</span><span className="flex items-center gap-2 text-[var(--color-text-muted)]"><FiUser size={16} /> {profile.role}</span></div></div><div className="flex flex-wrap justify-end gap-2 pt-2"><Button variant="secondary" onClick={cancelEditing} disabled={isSaving}><FiX size={16} /> Cancel</Button><Button type="submit" disabled={isSaving}>{isSaving ? "Saving profile..." : <><FiSave size={16} /> Save changes</>}</Button></div></form> : <div className="mt-6 grid gap-5 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">First name</p><p className="mt-1 font-medium text-[var(--color-text)]">{profile.firstName}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Last name</p><p className="mt-1 font-medium text-[var(--color-text)]">{profile.lastName}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Email address</p><p className="mt-1 flex items-center gap-2 font-medium text-[var(--color-text)]"><FiMail size={16} className="text-[var(--color-text-subtle)]" />{profile.email}</p><p className="mt-1 text-xs text-[var(--color-text-subtle)]">Email is managed by your account.</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Phone number</p><p className="mt-1 flex items-center gap-2 font-medium text-[var(--color-text)]"><FiPhone size={16} className="text-[var(--color-text-subtle)]" />{profile.phone || "Not added"}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">Role</p><p className="mt-1 font-medium text-[var(--color-text)]">{profile.role}</p><p className="mt-1 text-xs text-[var(--color-text-subtle)]">Role is managed by your organization.</p></div></div>}</Card>
      <Card className="h-fit p-5 sm:p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-peach-soft)] text-[var(--color-peach)]"><FiKey size={19} /></span><h2 className="mt-4 font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Password & security</h2><p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">Keep your TaskFlow account secure by using a strong password you do not reuse elsewhere.</p><Link to="/profile/change-password" className="mt-5 inline-flex"><Button variant="soft">Change password <FiKey size={16} /></Button></Link></Card>
    </section></div></MainLayout>;
}

export default Profile;
