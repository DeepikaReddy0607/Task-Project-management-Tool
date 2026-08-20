import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigationType, useNavigate } from "react-router-dom";
import { FiArrowRight, FiEye, FiEyeOff, FiLock, FiMail } from "react-icons/fi";
import beanieFallingImage from "../../assets/brand/intro/quackie-intro-beanie-falling.png";
import dropInImage from "../../assets/brand/intro/quackie-intro-drop-in.png";
import fixBeanieImage from "../../assets/brand/intro/quackie-intro-fix-beanie.png";
import noticeImage from "../../assets/brand/intro/quackie-intro-notice.png";
import waveImage from "../../assets/brand/intro/quackie-intro-wave.png";
import winterBackgroundImage from "../../assets/brand/taskflow-login-winter-background.png";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Card from "../../components/ui/Card";
import TaskFlowMark from "../../components/brand/TaskFlowMark";
import Quackie from "../../components/brand/Quackie";
import api from "../../services/api/axios";

const getInitialIntroPhase = (skipIntro) => (
  skipIntro || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ? "complete"
    : "entering"
);

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const shouldSkipIntro = Boolean(location.state?.skipIntro) && navigationType === "PUSH";
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [hasMockSuccess, setHasMockSuccess] = useState(false);
  const [introPhase, setIntroPhase] = useState(() => (
    getInitialIntroPhase(shouldSkipIntro) === "complete" ? "complete" : "beanieFalling"
  ));
  const [isCardRevealing, setIsCardRevealing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
  });

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
  const hasValidationError = Object.keys(errors).length > 0;
  const quackieEmotion = hasValidationError
    ? "worried"
    : isSubmitting
      ? "thinking"
      : activeField === "password"
        ? "eyesclosed"
        : isTyping
          ? "thinking"
          : hasMockSuccess
            ? "excited"
            : activeField === "email"
              ? "curious"
              : "happy";
  const isIntroActive = introPhase !== "complete";
  const getIntroLayerClass = (phase, motionClass = "") => {
    const isVisible = introPhase === phase;

    return `taskflow-login-intro-layer ${isVisible ? "taskflow-login-intro-layer-visible" : ""} ${isVisible ? motionClass : ""}`;
  };

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (shouldSkipIntro || motionQuery.matches) {
      return undefined;
    }

    const introTimers = [
      window.setTimeout(() => setIntroPhase("dropIn"), 700),
      window.setTimeout(() => setIntroPhase("fixBeanie"), 1500),
      window.setTimeout(() => setIntroPhase("notice"), 2500),
      window.setTimeout(() => setIntroPhase("wave"), 3400),
      window.setTimeout(() => setIsCardRevealing(true), 4300),
      window.setTimeout(() => {
        setIntroPhase("complete");
        setIsCardRevealing(false);
      }, 5000),
    ];

    const handleMotionChange = (event) => {
      if (event.matches) {
        introTimers.forEach((timer) => window.clearTimeout(timer));
        setIsCardRevealing(false);
        setIntroPhase("complete");
      }
    };

    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      introTimers.forEach((timer) => window.clearTimeout(timer));
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, [shouldSkipIntro]);

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

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setHasMockSuccess(false);

    try {
      const response = await api.post("/auth/login", {
        email: data.email,
        password: data.password,
      });

      const { token, user } = response.data;

      localStorage.setItem("taskflow_token", token);
      localStorage.setItem("taskflow_user", JSON.stringify(user));

      console.log("Login successful:", user);

      setHasMockSuccess(true);

      navigate("/", {
        replace: true,
      });
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Login failed. Please check your credentials.";

      console.error("Login failed:", message);

      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-cover bg-center bg-no-repeat px-4 py-6 sm:px-6 lg:flex lg:items-center lg:px-10 lg:py-10"
      style={{ backgroundImage: `url(${winterBackgroundImage})` }}
    >
      <TaskFlowMark className="absolute left-4 top-6 z-10 sm:left-6 lg:left-10 lg:top-8" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        <section className="taskflow-page-enter relative min-h-[20rem] pt-16 sm:min-h-[26rem] lg:min-h-[40rem] lg:pt-0" aria-label="TaskFlow welcome environment">
          <div className="relative mx-auto flex h-64 w-full max-w-xl items-end justify-center sm:h-80 lg:absolute lg:bottom-3 lg:left-[30%] lg:h-[22rem] lg:translate-x-0" aria-label="Quackie welcome illustration">
            {isIntroActive ? (
              <div className="relative h-full w-full" aria-hidden="true">
                <img src={beanieFallingImage} alt="" className={`${getIntroLayerClass("beanieFalling", "taskflow-login-intro-beanie-falling")} absolute inset-0 z-10 h-full w-full object-contain`} />
                <img src={dropInImage} alt="" className={`${getIntroLayerClass("dropIn", "taskflow-login-intro-drop-in")} absolute inset-0 z-10 h-full w-full object-contain`} />
                <img src={fixBeanieImage} alt="" className={`${getIntroLayerClass("fixBeanie")} absolute inset-0 z-10 h-full w-full object-contain`} />
                <img src={noticeImage} alt="" className={`${getIntroLayerClass("notice")} absolute inset-0 z-10 h-full w-full object-contain`} />
                <img src={waveImage} alt="" className={`${getIntroLayerClass("wave")} absolute inset-0 z-10 h-full w-full object-contain`} />
              </div>
            ) : (
              <div className="taskflow-login-intro-frame h-full w-full">
                <Quackie
                  emotion={quackieEmotion}
                  alt="Quackie waving while wearing a green beanie and scarf"
                  className="max-w-full"
                  style={{ height: "100%", width: "100%" }}
                />
              </div>
            )}
          </div>
        </section>

        <section className="w-full lg:translate-x-6 lg:justify-self-end" aria-labelledby="login-title">
          <div className="relative mx-auto w-full max-w-md">
            {isIntroActive && (
              <aside className={`taskflow-login-intro-welcome pointer-events-none absolute inset-0 z-20 flex items-center ${isCardRevealing ? "taskflow-login-intro-welcome-exit" : ""}`} aria-live="polite">
                <Card className="w-full rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)] px-7 py-10 text-center shadow-[var(--shadow-lg)] backdrop-blur-sm sm:px-10">
                  <p className="text-sm font-semibold text-[var(--color-brand-hover)]">Welcome to TaskFlow! <span aria-hidden="true">&#10024;</span></p>
                  <p className="mt-3 font-[var(--font-display)] text-xl font-semibold tracking-[-0.025em] text-[var(--color-text)]">Meet Quackie, your little project buddy.</p>
                  <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Getting things ready...</p>
                </Card>
              </aside>
            )}
            <div className={isIntroActive ? (isCardRevealing ? "taskflow-login-card-reveal" : "taskflow-login-card-pending") : ""} aria-hidden={isIntroActive} inert={isIntroActive ? "" : undefined}>
            <Card className="w-full rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-8 lg:p-10">
            <header>
              <p className="text-sm font-semibold text-[var(--color-brand-hover)]">TaskFlow</p>
              <h2 id="login-title" className="mt-3 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]">Welcome back!</h2>
              <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Pick up where your plans left off and keep your best work moving.</p>
            </header>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--color-text)]">Email address</label>
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
                <label htmlFor="password" className="mb-2 block text-sm font-medium text-[var(--color-text)]">Password</label>
                <div className="relative">
                  <FiLock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" size={17} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    aria-invalid={errors.password ? "true" : undefined}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    className={`w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] py-2.5 pl-10 pr-12 text-sm text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition duration-[var(--duration-base)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] ${errors.password ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]" : "border-[var(--color-border)]"}`}
                    {...passwordRegistration}
                    onFocus={() => handleFieldFocus("password")}
                    onBlur={(event) => handleFieldBlur(event, passwordRegistration.onBlur)}
                    onChange={(event) => handleFieldChange(event, passwordRegistration.onChange)}
                  />
                  <button type="button" onFocus={() => handleFieldFocus("password")} onBlur={() => { setIsTyping(false); setActiveField(null); }} onClick={() => { setHasMockSuccess(false); setActiveField("password"); setShowPassword((currentValue) => !currentValue); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--color-text-subtle)] transition duration-[var(--duration-base)] hover:bg-[var(--color-canvas-soft)] hover:text-[var(--color-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <FiEye size={18} /> : <FiEyeOff size={18} />}
                  </button>
                </div>
                {errors.password && <p id="password-error" className="mt-2 text-sm text-[var(--color-danger)]" role="alert">{errors.password.message}</p>}
                <Link to="/forgot-password" className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline">Forgot password?</Link>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full py-3.5">
                {isSubmitting ? "Signing in..." : <><span>Sign in</span><FiArrowRight size={18} /></>}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-text-subtle)]" aria-hidden="true"><span className="h-px flex-1 bg-[var(--color-border)]" />or<span className="h-px flex-1 bg-[var(--color-border)]" /></div>
            <p className="text-center text-sm text-[var(--color-text-muted)]">New to TaskFlow? <Link to="/register" className="font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline">Create an account</Link></p>
            </Card>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default Login;
