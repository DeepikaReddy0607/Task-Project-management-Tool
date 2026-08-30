import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle, FiEye, FiEyeOff, FiKey, FiLock } from "react-icons/fi";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import MainLayout from "../../layouts/MainLayout";

const inputClasses = (error) => `w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] py-2.5 pl-10 pr-12 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] ${error ? "border-[var(--color-danger)] focus:border-[var(--color-danger)]" : "border-[var(--color-border)]"}`;

function PasswordField({ error, label, name, registration, show, setShow }) {
  return <div><label htmlFor={name} className="mb-2 block text-sm font-medium text-[var(--color-text)]">{label}</label><div className="relative"><FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} /><input id={name} type={show ? "text" : "password"} autoComplete={name === "currentPassword" ? "current-password" : "new-password"} className={inputClasses(error)} aria-invalid={error ? "true" : undefined} aria-describedby={error ? `${name}-error` : undefined} {...registration} /><button type="button" onClick={() => setShow((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>{show ? <FiEye size={18} /> : <FiEyeOff size={18} />}</button></div>{error && <p id={`${name}-error`} className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{error}</p>}</div>;
}

function ChangePassword() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const { register, handleSubmit, getValues, formState: { errors } } = useForm({ defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" } });
  const currentRegistration = register("currentPassword", { required: "Current password is required." });
  const newRegistration = register("newPassword", { required: "New password is required.", minLength: { value: 6, message: "New password must be at least 6 characters." }, validate: (value) => value !== getValues("currentPassword") || "New password must be different from your current password." });
  const confirmRegistration = register("confirmPassword", { required: "Please confirm your new password.", validate: (value) => value === getValues("newPassword") || "Passwords do not match." });
  const onSubmit = () => { setIsSaving(true); window.setTimeout(() => { setIsSaving(false); setIsSaved(true); }, 450); };

  return <MainLayout><div className="space-y-6 sm:space-y-8"><PageHeader title="Change password" description="Update your password with a secure, memorable phrase." actions={<Link to="/profile"><Button variant="secondary"><FiArrowLeft size={16} /> Back to profile</Button></Link>} />
    <Card className="mx-auto max-w-2xl p-5 sm:p-7">{isSaved ? <div className="taskflow-success-pop py-6 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]"><FiCheckCircle size={28} /></span><h2 className="mt-5 font-[var(--font-display)] text-2xl font-semibold text-[var(--color-text)]">Password updated</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">Your local password-change preview is complete. Backend password updates will be connected separately.</p><Link to="/profile" className="mt-6 inline-flex"><Button>Return to profile</Button></Link></div> : <><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-peach-soft)] text-[var(--color-peach)]"><FiKey size={19} /></span><div><h2 className="font-[var(--font-display)] text-xl font-semibold text-[var(--color-text)]">Choose a new password</h2><p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">Use at least six characters and avoid reusing your current password.</p></div></div><form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-7 space-y-5"><PasswordField name="currentPassword" label="Current password" registration={currentRegistration} error={errors.currentPassword?.message} show={showCurrent} setShow={setShowCurrent} /><PasswordField name="newPassword" label="New password" registration={newRegistration} error={errors.newPassword?.message} show={showNew} setShow={setShowNew} /><PasswordField name="confirmPassword" label="Confirm new password" registration={confirmRegistration} error={errors.confirmPassword?.message} show={showConfirm} setShow={setShowConfirm} /><div className="flex flex-wrap justify-end gap-2 pt-2"><Link to="/profile"><Button variant="secondary">Cancel</Button></Link><Button type="submit" disabled={isSaving}>{isSaving ? "Updating password..." : "Update password"}</Button></div></form></>}</Card>
  </div></MainLayout>;
}

export default ChangePassword;
