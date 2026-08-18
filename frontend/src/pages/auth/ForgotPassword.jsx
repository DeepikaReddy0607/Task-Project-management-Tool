import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheckCircle, FiMail } from "react-icons/fi";
import winterBackgroundImage from "../../assets/brand/taskflow-login-winter-background.png";
import TaskFlowMark from "../../components/brand/TaskFlowMark";
import Quackie from "../../components/brand/Quackie";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";

function ForgotPassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isEmailActive, setIsEmailActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: { email: "" },
  });

  const emailRegistration = register("email", {
    required: "Email address is required.",
    pattern: {
      value: /^\S+@\S+\.\S+$/,
      message: "Enter a valid email address.",
    },
  });
  const quackieEmotion = submitError || Object.keys(errors).length > 0
    ? "worried"
    : isSubmitting || isEmailActive || isTyping
      ? "thinking"
      : submittedEmail
        ? "excited"
        : "curious";

  const handleEmailFocus = () => {
    setIsTyping(false);
    setIsEmailActive(true);
  };

  const handleEmailBlur = (event) => {
    emailRegistration.onBlur(event);
    setIsTyping(false);
    setIsEmailActive(false);
  };

  const handleEmailChange = (event) => {
    setIsTyping(true);
    emailRegistration.onChange(event);
  };

  const onSubmit = async ({ email }) => {
    setIsSubmitting(true);
    setSubmitError("");

    try {
      // Frontend-only mock: no reset request is sent until the API contract exists.
      await Promise.resolve();
      setSubmittedEmail(email);
    } catch {
      setSubmitError("We could not prepare reset instructions. Please try again.");
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

        <section className="taskflow-fade-slide-in w-full lg:translate-x-6 lg:justify-self-end" aria-labelledby="forgot-password-title">
          <Card className="mx-auto w-full max-w-md rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-8 lg:p-10">
            {submittedEmail ? (
              <div className="taskflow-success-pop text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface-sage)] text-[var(--color-brand)]" aria-hidden="true"><FiCheckCircle size={28} /></span>
                <h1 id="forgot-password-title" className="mt-5 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]">Check your inbox</h1>
                <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Demo mode: reset instructions would be sent to <span className="font-semibold text-[var(--color-text)]">{submittedEmail}</span> when the authentication API is available.</p>
                <Link to="/login" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] hover:underline"><FiArrowLeft size={16} aria-hidden="true" /> Back to sign in</Link>
              </div>
            ) : (
              <>
                <header>
                  <p className="text-sm font-semibold text-[var(--color-brand-hover)]">TaskFlow</p>
                  <h1 id="forgot-password-title" className="mt-3 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]">Forgot your password?</h1>
                  <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">Enter your email and we&apos;ll help you get back to the work that matters.</p>
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
                        onFocus={handleEmailFocus}
                        onBlur={handleEmailBlur}
                        onChange={handleEmailChange}
                      />
                    </div>
                  </div>

                  {submitError && <p className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-3 py-2.5 text-sm text-[var(--color-danger)]" role="alert">{submitError}</p>}

                  <Button type="submit" disabled={isSubmitting} className="w-full py-3.5">
                    {isSubmitting ? "Preparing instructions..." : <><span>Send reset instructions</span><FiArrowRight size={18} /></>}
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

export default ForgotPassword;
