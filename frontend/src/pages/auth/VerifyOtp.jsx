import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiMail,
  FiRefreshCw,
  FiShield,
} from "react-icons/fi";
import winterBackgroundImage from "../../assets/brand/taskflow-login-winter-background.png";
import TaskFlowMark from "../../components/brand/TaskFlowMark";
import Quackie from "../../components/brand/Quackie";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import { verifyRegistrationOtp, resendRegistrationOtp } from "../../services/api/authApi";

const OTP_LENGTH = 6;
const INITIAL_COOLDOWN_SECONDS = 60;

function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();

  // Retrieve email from navigation state, URL query parameter, or session storage
  const [email, setEmail] = useState(() => {
    const searchParams = new URLSearchParams(location.search);
    const queryEmail = searchParams.get("email");
    return (
      location.state?.email ||
      queryEmail ||
      sessionStorage.getItem("taskflow_pending_email") ||
      ""
    );
  });

  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [apiError, setApiError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [countdown, setCountdown] = useState(INITIAL_COOLDOWN_SECONDS);
  const [isTyping, setIsTyping] = useState(false);
  const [hasSuccess, setHasSuccess] = useState(false);
  const [manualEmailInput, setManualEmailInput] = useState("");

  const inputRefs = useRef([]);

  // Auto-focus first empty input on mount
  useEffect(() => {
    if (email && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [email]);

  // Resend cooldown countdown interval
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // Determine Quackie mascot emotion based on interaction state
  const quackieEmotion = hasSuccess
    ? "excited"
    : apiError
      ? "worried"
      : isSubmitting || isResending
        ? "thinking"
        : isTyping
          ? "thinking"
          : "curious";

  const handleDigitChange = (index, event) => {
    const rawVal = event.target.value;
    // Keep only numbers
    const cleaned = rawVal.replace(/\D/g, "");

    setApiError("");
    setSuccessMessage("");
    setIsTyping(true);

    if (!cleaned) {
      // User deleted character
      const nextDigits = [...digits];
      nextDigits[index] = "";
      setDigits(nextDigits);
      return;
    }

    // Single digit input
    const char = cleaned.slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = char;
    setDigits(nextDigits);

    // Auto-advance to next input
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    } else {
      inputRefs.current[index]?.blur();
      setIsTyping(false);
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current box is empty, move focus to previous and clear it
        const nextDigits = [...digits];
        nextDigits[index - 1] = "";
        setDigits(nextDigits);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData("text/plain").trim();
    const numericOnly = pastedData.replace(/\D/g, "").slice(0, OTP_LENGTH);

    if (!numericOnly) return;

    const nextDigits = [...digits];
    for (let i = 0; i < OTP_LENGTH; i++) {
      nextDigits[i] = numericOnly[i] || "";
    }
    setDigits(nextDigits);
    setApiError("");

    // Focus last filled digit or the next empty one
    const targetIndex = Math.min(numericOnly.length, OTP_LENGTH - 1);
    inputRefs.current[targetIndex]?.focus();
    setIsTyping(false);
  };

  const handleVerify = async (event) => {
    if (event) event.preventDefault();

    const otp = digits.join("");
    if (otp.length !== OTP_LENGTH) {
      setApiError("Please enter all 6 digits of the verification code.");
      return;
    }

    if (!email) {
      setApiError("Email address is missing. Please return to registration.");
      return;
    }

    setIsSubmitting(true);
    setApiError("");
    setSuccessMessage("");

    try {
      const response = await verifyRegistrationOtp({
        email: email.toLowerCase().trim(),
        otp,
      });

      console.log("OTP verification successful:", response);
      setHasSuccess(true);
      setSuccessMessage("Email verified successfully! Preparing your sign-in...");
      sessionStorage.removeItem("taskflow_pending_email");

      // Smooth redirection to login page with pre-filled success notice
      setTimeout(() => {
        navigate("/login", {
          state: {
            message: "Email verified successfully! Please log in to get started.",
            skipIntro: true,
            startOnboarding: true,
          },
        });
      }, 1000);
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.userMessage ||
        "Verification failed. Please check the code and try again.";

      console.error("OTP verification error:", message);
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || isResending) return;

    if (!email) {
      setApiError("Please provide your email address to resend the code.");
      return;
    }

    setIsResending(true);
    setApiError("");
    setSuccessMessage("");

    try {
      const response = await resendRegistrationOtp({
        email: email.toLowerCase().trim(),
      });

      console.log("OTP resend successful:", response);
      setSuccessMessage("A fresh verification code has been sent to your email.");
      setCountdown(INITIAL_COOLDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));

      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } catch (error) {
      const retryAfter = error.response?.data?.retryAfter;
      if (retryAfter) {
        setCountdown(retryAfter);
      }

      const message =
        error.response?.data?.message ||
        error.userMessage ||
        "Failed to resend code. Please try again later.";

      console.error("OTP resend error:", message);
      setApiError(message);
    } finally {
      setIsResending(false);
    }
  };

  const handleSetManualEmail = (event) => {
    event.preventDefault();
    if (!manualEmailInput || !manualEmailInput.includes("@")) {
      setApiError("Please enter a valid email address.");
      return;
    }
    const cleanEmail = manualEmailInput.toLowerCase().trim();
    setEmail(cleanEmail);
    sessionStorage.setItem("taskflow_pending_email", cleanEmail);
    setApiError("");
  };

  const isOtpComplete = digits.every((d) => d !== "");

  return (
    <main
      className="relative min-h-screen overflow-x-hidden bg-cover bg-center bg-no-repeat px-4 py-6 sm:px-6 lg:flex lg:items-center lg:px-10 lg:py-10"
      style={{ backgroundImage: `url(${winterBackgroundImage})` }}
    >
      <TaskFlowMark className="absolute left-4 top-6 z-10 sm:left-6 lg:left-10 lg:top-8" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16">
        {/* Left column: Quackie mascot greeting */}
        <section
          className="taskflow-page-enter relative min-h-[20rem] pt-16 sm:min-h-[26rem] lg:min-h-[40rem] lg:pt-0"
          aria-label="TaskFlow security environment"
        >
          <div
            className="relative mx-auto flex h-64 max-w-xl items-end justify-center sm:h-80 lg:absolute lg:bottom-3 lg:left-[30%] lg:h-[22rem] lg:translate-x-0"
            aria-label="Quackie verification buddy"
          >
            <Quackie
              key={quackieEmotion}
              emotion={quackieEmotion}
              alt="Quackie watching attentively during verification"
              className="taskflow-fade-slide-in max-w-full"
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        </section>

        {/* Right column: Verification card */}
        <section
          className="taskflow-fade-slide-in w-full lg:translate-x-6 lg:justify-self-end"
          aria-labelledby="otp-title"
        >
          <div className="relative mx-auto w-full max-w-md">
            <Card className="w-full rounded-[var(--radius-2xl)] border-white/75 bg-[color-mix(in_srgb,var(--color-surface)_90%,transparent)] p-6 shadow-[var(--shadow-lg)] backdrop-blur-sm sm:p-8 lg:p-10">
            <header>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--color-brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-brand-hover)]">
                  <FiShield size={13} aria-hidden="true" />
                  Security
                </span>
              </div>
              <h1
                id="otp-title"
                className="mt-3 font-[var(--font-display)] text-3xl font-semibold leading-[var(--line-height-tight)] tracking-[-0.04em] text-[var(--color-text)]"
              >
                Verify your email
              </h1>

              {email ? (
                <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                  We've sent a 6-digit confirmation code to{" "}
                  <strong className="font-semibold text-[var(--color-text)] break-all">{email}</strong>.
                  Enter the code below to activate your account.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-[var(--line-height-relaxed)] text-[var(--color-text-muted)]">
                  Please enter the email address you registered with to continue verification.
                </p>
              )}
            </header>

            {/* Email missing recovery fallback */}
            {!email ? (
              <form onSubmit={handleSetManualEmail} className="mt-6 space-y-4">
                {apiError && (
                  <div
                    role="alert"
                    className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
                  >
                    {apiError}
                  </div>
                )}
                <div>
                  <label htmlFor="manualEmail" className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                    Your registration email
                  </label>
                  <div className="relative">
                    <FiMail
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
                      size={17}
                      aria-hidden="true"
                    />
                    <Input
                      id="manualEmail"
                      type="email"
                      placeholder="you@example.com"
                      value={manualEmailInput}
                      onChange={(e) => setManualEmailInput(e.target.value)}
                      className="pl-10"
                      autoFocus
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full py-3">
                  Continue to verification
                </Button>
                <div className="text-center">
                  <Link
                    to="/register"
                    className="text-xs text-[var(--color-brand-hover)] hover:underline"
                  >
                    ← Back to registration
                  </Link>
                </div>
              </form>
            ) : (
              <form className="mt-7 space-y-5" onSubmit={handleVerify} noValidate>
                {/* Feedback banners */}
                {apiError && (
                  <div
                    role="alert"
                    className="taskflow-fade-slide-in rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]"
                  >
                    {apiError}
                  </div>
                )}

                {successMessage && (
                  <div
                    role="status"
                    className="taskflow-fade-slide-in flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-brand-soft)] px-4 py-3 text-sm text-[var(--color-brand-hover)]"
                  >
                    <FiCheckCircle size={16} className="shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* 6-digit individual box inputs */}
                <div>
                  <label className="mb-3 block text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                    Enter 6-digit code
                  </label>
                  <div
                    className="flex items-center justify-between gap-1.5 sm:gap-2.5"
                    onPaste={handlePaste}
                  >
                    {digits.map((digit, idx) => {
                      const hasErr = Boolean(apiError);
                      return (
                        <input
                          key={idx}
                          ref={(el) => (inputRefs.current[idx] = el)}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          disabled={isSubmitting || hasSuccess}
                          onChange={(e) => handleDigitChange(idx, e)}
                          onKeyDown={(e) => handleKeyDown(idx, e)}
                          aria-label={`Digit ${idx + 1} of 6`}
                          className={`h-12 w-11 sm:h-14 sm:w-13 rounded-[var(--radius-md)] border bg-[var(--color-surface)] text-center font-mono text-xl sm:text-2xl font-bold text-[var(--color-text)] shadow-[var(--shadow-xs)] outline-none transition duration-[var(--duration-base)] focus:border-[var(--color-brand)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] disabled:opacity-60 ${
                            hasErr
                              ? "border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-danger)_16%,transparent)]"
                              : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Expiry and resend indicators */}
                <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] bg-[var(--color-canvas-soft)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                    <FiClock size={13} className="text-[var(--color-brand)]" aria-hidden="true" />
                    Code expires in 5 minutes
                  </span>

                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={countdown > 0 || isResending || isSubmitting || hasSuccess}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-hover)] transition hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:text-[var(--color-text-subtle)] hover:underline"
                  >
                    <FiRefreshCw
                      size={12}
                      className={isResending ? "animate-spin" : ""}
                      aria-hidden="true"
                    />
                    {isResending ? (
                      "Sending..."
                    ) : countdown > 0 ? (
                      `Resend in ${countdown}s`
                    ) : (
                      "Resend code"
                    )}
                  </button>
                </div>

                {/* Verification CTA */}
                <Button
                  type="submit"
                  disabled={isSubmitting || !isOtpComplete || hasSuccess}
                  className="w-full py-3.5"
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-1" />
                      <span>Verifying...</span>
                    </>
                  ) : hasSuccess ? (
                    <>
                      <FiCheckCircle size={18} />
                      <span>Verified!</span>
                    </>
                  ) : (
                    <>
                      <span>Verify and complete registration</span>
                      <FiArrowRight size={18} aria-hidden="true" />
                    </>
                  )}
                </Button>

                {/* Footer helpers */}
                <div className="flex items-center justify-between pt-2 text-xs text-[var(--color-text-muted)]">
                  <Link
                    to="/register"
                    className="hover:text-[var(--color-brand-hover)] hover:underline"
                  >
                    Change email address
                  </Link>

                  <Link
                    to="/login"
                    state={{ skipIntro: true }}
                    className="font-medium text-[var(--color-brand-hover)] hover:underline"
                  >
                    Already verified? Sign in
                  </Link>
                </div>
              </form>
            )}
          </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

export default VerifyOtp;
