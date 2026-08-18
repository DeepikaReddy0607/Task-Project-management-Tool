import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FiAlertCircle, FiArrowLeft, FiArrowRight, FiCheckCircle, FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import winterBackgroundImage from "../../assets/brand/taskflow-login-winter-background.png";
import TaskFlowMark from "../../components/brand/TaskFlowMark";
import Quackie from "../../components/brand/Quackie";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";

const passwordInputClasses = (hasError) =>
  `w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] py-2.5 pl-10 pr-12 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition duration-[var(--duration-base)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] ${hasError ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]" : "border-[var(--color-border)]"}`;

function ResetPassword() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [screenState, setScreenState] = useState("initial");
  const [activeField, setActiveField] = useState(null);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { password: "", confirmPassword: "" },
  });

  const passwordRegistration = register("password", {
    required: "Password is required.",
    minLength: { value: 8, message: "Password must be at least 8 characters." },
  });
  const confirmPasswordRegistration = register("confirmPassword", {
    required: "Please confirm your password.",
    validate: (value) => value === getValues("password") || "Passwords do not match.",
  });
  const hasValidationError = Object.keys(errors).length > 0;
  const quackieEmotion = screenState === "expired" || hasValidationError
    ? "worried"
    : screenState === "success"
      ? "excited"
      : isSubmitting || screenState === "submitting"
        ? "thinking"
        : activeField === "password" || activeField === "confirmPassword"
          ? "eyesclosed"
          : "thinking";

  const handleFieldFocus = (field) => {
    setActiveField(field);
  };

  const handleFieldBlur = (event, onBlur) => {
    onBlur(event);
    setActiveField(null);
  };

  const handleFieldChange = (event, onChange) => {
    onChange(event);
  };

  const onSubmit = async () => {
    setScreenState("submitting");

    try {
      // Frontend-only mock: no reset request, token validation, or password update happens here.
      await Promise.resolve();
      setScreenState("success");
    } catch {
      setScreenState("expired");
    }
  };

  const headingClasses = "mt-5 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]";

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-cover bg-center bg-no-repeat px-4 py-6 sm:px-6 lg:flex lg:items-center lg:px-10 lg:py-10" style={{ backgroundImage: `url(${winterBackgroundImage})` }}>
      <TaskFlowMark className="absolute left-4 top-6 z-10 sm:left-6 lg:left-10 lg:top-8" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <section className="taskflow-page-enter relative min-h-[20rem] pt-16 sm:min-h-[26rem] lg:min-h-[40rem] lg:pt-0" aria-label="TaskFlow welcome environment">
          <div className="relative mx-auto flex h-64 max-w-xl items-end justify-center sm:h-80 lg:absolute lg:bottom-3 lg:left-[30%] lg:h-[22rem] lg:translate-x-0" aria-label="Quackie welcome illustration">
            <Quackie
              key={quackieEmotion}
              emotion={quackieEmotion}
              alt="Quackie waving while wearing a green beanie and scarf"
              className="taskflow-fade-slide-in max-w-full"
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        </section>

        <section className="taskflow-fade-slide-in w-full lg:translate-x-6 lg:justify-self-end" aria-labelledby="reset-password-title">
          <Card className="mx-auto w-full max-w-md rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-8 lg:p-10">
            {screenState === "success" ? (
              <div className="taskflow-success-pop text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]" aria-hidden="true"><FiCheckCircle size={28} /></span>
                <h1 id="reset-password-title" className={headingClasses}>Password reset preview complete</h1>
                <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Demo mode: your new password has not been saved. The authentication API will perform the actual reset once its contract is available.</p>
                <Link to="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline"><FiArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>
              </div>
            ) : screenState === "expired" ? (
              <div className="text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-danger-soft)] text-[var(--color-danger)]" aria-hidden="true"><FiAlertCircle size={28} /></span>
                <h1 id="reset-password-title" className={headingClasses}>Reset link preview unavailable</h1>
                <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Frontend preview only: the eventual API will determine whether a reset link is valid or expired.</p>
                <Link to="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline"><FiArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>
              </div>
            ) : (
              <>
                <header>
                  <p className="text-sm font-semibold text-[var(--color-brand-hover)]">TaskFlow</p>
                  <h1 id="reset-password-title" className="mt-3 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]">Reset your password</h1>
                  <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Choose a new password for your TaskFlow account.</p>
                </header>

                <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                  <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--color-text)]">New password</label>
                    <div className="relative">
                      <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                      <input id="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Create a new password" aria-invalid={errors.password ? "true" : undefined} aria-describedby={errors.password ? "password-error" : undefined} className={passwordInputClasses(errors.password)} {...passwordRegistration} onFocus={() => handleFieldFocus("password")} onBlur={(event) => handleFieldBlur(event, passwordRegistration.onBlur)} onChange={(event) => handleFieldChange(event, passwordRegistration.onChange)} />
                      <button type="button" onFocus={() => handleFieldFocus("password")} onBlur={() => setActiveField(null)} onClick={() => { setActiveField("password"); setShowPassword((currentValue) => !currentValue); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <FiEye size={18} /> : <FiEyeOff size={18} />}</button>
                    </div>
                    {errors.password && <p id="password-error" className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{errors.password.message}</p>}
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-[var(--color-text)]">Confirm new password</label>
                    <div className="relative">
                      <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                      <input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="Confirm your new password" aria-invalid={errors.confirmPassword ? "true" : undefined} aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined} className={passwordInputClasses(errors.confirmPassword)} {...confirmPasswordRegistration} onFocus={() => handleFieldFocus("confirmPassword")} onBlur={(event) => handleFieldBlur(event, confirmPasswordRegistration.onBlur)} onChange={(event) => handleFieldChange(event, confirmPasswordRegistration.onChange)} />
                      <button type="button" onFocus={() => handleFieldFocus("confirmPassword")} onBlur={() => setActiveField(null)} onClick={() => { setActiveField("confirmPassword"); setShowConfirmPassword((currentValue) => !currentValue); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}>{showConfirmPassword ? <FiEye size={18} /> : <FiEyeOff size={18} />}</button>
                    </div>
                    {errors.confirmPassword && <p id="confirm-password-error" className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{errors.confirmPassword.message}</p>}
                  </div>

                  <Button type="submit" disabled={isSubmitting || screenState === "submitting"} className="w-full py-3.5">
                    {screenState === "submitting" ? "Resetting password..." : <><span>Reset password</span><FiArrowRight size={18} /></>}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]"><Link to="/login" className="inline-flex items-center gap-2 font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline"><FiArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link></p>
              </>
            )}
          </Card>
        </section>
      </div>
    </main>
  );
}

export default ResetPassword;
