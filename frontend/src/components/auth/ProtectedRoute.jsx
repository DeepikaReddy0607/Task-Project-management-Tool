import { Navigate, useLocation } from "react-router-dom";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("taskflow_token");

  if (!token) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return children;
}

export default ProtectedRoute;
