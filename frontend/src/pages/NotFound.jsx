import { useNavigate } from "react-router-dom";
import { FiAlertCircle, FiArrowLeft, FiHome } from "react-icons/fi";
import Button from "../components/ui/Button";

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-canvas)] px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-danger-soft)] text-[var(--color-danger)] mb-6 shadow-sm">
        <FiAlertCircle size={32} />
      </div>
      <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-sm text-[var(--color-text-muted)] leading-relaxed">
        The page you are looking for doesn't exist or has been moved. Check the URL or navigate back to your dashboard.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={() => navigate(-1)}>
          <FiArrowLeft size={16} /> Go Back
        </Button>
        <Button onClick={() => navigate("/")}>
          <FiHome size={16} /> Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

export default NotFound;
