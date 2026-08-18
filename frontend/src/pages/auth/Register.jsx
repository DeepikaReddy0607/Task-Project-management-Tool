import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  FiArrowRight,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMail,
  FiPhone,
  FiUser,
} from "react-icons/fi";
import winterBackgroundImage from "../../assets/brand/taskflow-login-winter-background.png";
import TaskFlowMark from "../../components/brand/TaskFlowMark";
import Quackie from "../../components/brand/Quackie";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";

const passwordInputClasses = (hasError) =>
  `w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] py-2.5 pl-10 pr-12 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition duration-[var(--duration-base)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] ${hasError ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]" : "border-[var(--color-border)]"}`;

function Register() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [hasMockSuccess, setHasMockSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const firstNameRegistration = register("firstName", {
    required: "First name is required.",
  });
  const lastNameRegistration = register("lastName", {
    required: "Last name is required.",
  });
  const phoneRegistration = register("phone");
  const emailRegistration = register("email", {
    required: "Email address is required.",
    pattern: {
      value: /^\S+@\S+\.\S+$/,
      message: "Enter a valid email address.",
    },
  });
  const passwordRegistration = register("password", {
    required: "Password is required.",
    minLength: {
      value: 6,
      message: "Password must be at least 6 characters.",
    },
  });
  const confirmPasswordRegistration = register("confirmPassword", {
    required: "Please confirm your password.",
    validate: (value) =>
      value === getValues("password") || "Passwords do not match.",
  });
  const hasValidationError = Object.keys(errors).length > 0;
  const quackieEmotion = hasValidationError
    ? "worried"
    : isSubmitting
      ? "thinking"
      : activeField === "password" || activeField === "confirmPassword"
        ? "eyesclosed"
        : isTyping
          ? "thinking"
          : hasMockSuccess
            ? "excited"
            : activeField === "firstName" || activeField === "lastName" || activeField === "email" || activeField === "phone"
              ? "curious"
              : "happy";

  const handleFieldFocus = (field) => {
    setHasMockSuccess(false);
    setIsTyping(false);
    setActiveField(field);
  };

  const handleFieldBlur = (event, onBlur) => {
    onBlur(event);
    setIsTyping(false);
    setActiveField(null);
  };

  const handleFieldChange = (event, onChange) => {
    setHasMockSuccess(false);
    setIsTyping(true);
    onChange(event);
  };

  const onSubmit = async () => {
    setIsSubmitting(true);
    setHasMockSuccess(false);

    // Backend registration integration will be added once the API contract is ready.
    await Promise.resolve();

    setIsSubmitting(false);
    setHasMockSuccess(true);
  };

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-cover bg-center bg-no-repeat px-4 py-6 sm:px-6 lg:flex lg:items-center lg:px-10 lg:py-10"
      style={{ backgroundImage: `url(${winterBackgroundImage})` }}
    >
      <TaskFlowMark className="absolute left-4 top-6 z-10 sm:left-6 lg:left-10 lg:top-8" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <section
          className="taskflow-page-enter relative min-h-[20rem] pt-16 sm:min-h-[26rem] lg:min-h-[40rem] lg:pt-0"
          aria-label="TaskFlow welcome environment"
        >
          <div
            className="relative mx-auto flex h-64 max-w-xl items-end justify-center sm:h-80 lg:absolute lg:bottom-3 lg:left-[30%] lg:h-[22rem] lg:translate-x-0"
            aria-label="Quackie welcome illustration"
          >
            <Quackie
              key={quackieEmotion}
              emotion={quackieEmotion}
              alt="Quackie waving while wearing a green beanie and scarf"
              className="taskflow-fade-slide-in max-w-full"
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        </section>

        <section
          className="taskflow-fade-slide-in w-full lg:translate-x-6 lg:justify-self-end"
          aria-labelledby="register-title"
        >
          <Card className="mx-auto w-full max-w-md rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-8 lg:p-10">
            <header>
              <p className="text-sm font-semibold text-[var(--color-brand-hover)]">TaskFlow</p>
              <h1
                id="register-title"
                className="mt-3 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]"
              >
                Create your account
              </h1>
              <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                Bring your plans together and make meaningful progress, one task at a time.
              </p>
            </header>

            <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    First name
                  </label>
                  <div className="relative">
                    <FiUser className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      placeholder="First name"
                      error={errors.firstName?.message}
                      className="pl-10"
                      {...firstNameRegistration}
                      onFocus={() => handleFieldFocus("firstName")}
                      onBlur={(event) => handleFieldBlur(event, firstNameRegistration.onBlur)}
                      onChange={(event) => handleFieldChange(event, firstNameRegistration.onChange)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Last name
                  </label>
                  <div className="relative">
                    <FiUser className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      placeholder="Last name"
                      error={errors.lastName?.message}
                      className="pl-10"
                      {...lastNameRegistration}
                      onFocus={() => handleFieldFocus("lastName")}
                      onBlur={(event) => handleFieldBlur(event, lastNameRegistration.onBlur)}
                      onChange={(event) => handleFieldChange(event, lastNameRegistration.onChange)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Email address
                </label>
                <div className="relative">
                  <FiMail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    error={errors.email?.message}
                    className="pl-10"
                    {...emailRegistration}
                    onFocus={() => handleFieldFocus("email")}
                    onBlur={(event) => handleFieldBlur(event, emailRegistration.onBlur)}
                    onChange={(event) => handleFieldChange(event, emailRegistration.onChange)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Phone number <span className="text-[var(--color-text-subtle)]">(optional)</span>
                </label>
                <div className="relative">
                  <FiPhone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="Your phone number"
                    className="pl-10"
                    {...phoneRegistration}
                    onFocus={() => handleFieldFocus("phone")}
                    onBlur={(event) => handleFieldBlur(event, phoneRegistration.onBlur)}
                    onChange={(event) => handleFieldChange(event, phoneRegistration.onChange)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Password
                </label>
                <div className="relative">
                  <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Create a password"
                    aria-invalid={errors.password ? "true" : undefined}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className={passwordInputClasses(errors.password)}
                    {...passwordRegistration}
                    onFocus={() => handleFieldFocus("password")}
                    onBlur={(event) => handleFieldBlur(event, passwordRegistration.onBlur)}
                    onChange={(event) => handleFieldChange(event, passwordRegistration.onChange)}
                  />
                  <button
                    type="button"
                    onFocus={() => handleFieldFocus("password")}
                    onBlur={() => { setIsTyping(false); setActiveField(null); }}
                    onClick={() => { setHasMockSuccess(false); setActiveField("password"); setShowPassword((currentValue) => !currentValue); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FiEye size={18} /> : <FiEyeOff size={18} />}
                  </button>
                </div>
                {errors.password && <p id="password-error" className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{errors.password.message}</p>}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                  Confirm password
                </label>
                <div className="relative">
                  <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    aria-invalid={errors.confirmPassword ? "true" : undefined}
                    aria-describedby={errors.confirmPassword ? "confirm-password-error" : undefined}
                    className={passwordInputClasses(errors.confirmPassword)}
                    {...confirmPasswordRegistration}
                    onFocus={() => handleFieldFocus("confirmPassword")}
                    onBlur={(event) => handleFieldBlur(event, confirmPasswordRegistration.onBlur)}
                    onChange={(event) => handleFieldChange(event, confirmPasswordRegistration.onChange)}
                  />
                  <button
                    type="button"
                    onFocus={() => handleFieldFocus("confirmPassword")}
                    onBlur={() => { setIsTyping(false); setActiveField(null); }}
                    onClick={() => { setHasMockSuccess(false); setActiveField("confirmPassword"); setShowConfirmPassword((currentValue) => !currentValue); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  >
                    {showConfirmPassword ? <FiEye size={18} /> : <FiEyeOff size={18} />}
                  </button>
                </div>
                {errors.confirmPassword && <p id="confirm-password-error" className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{errors.confirmPassword.message}</p>}
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full py-3.5">
                {isSubmitting ? "Creating account..." : <><span>Create account</span><FiArrowRight size={18} /></>}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
              Already have an account?{" "}
              <Link to="/login" state={{ skipIntro: true }} className="font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline">
                Sign in
              </Link>
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default Register;
