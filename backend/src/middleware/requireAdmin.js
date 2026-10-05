/**
 * Require Admin Middleware (Phase 15)
 * 
 * Enforces server-side Role-Based Access Control (RBAC) for administration endpoints.
 * 
 * Invariants:
 * - Rejects unauthenticated requests with 401 Unauthorized
 * - Rejects non-Admin roles (e.g. Team Member, Project Manager) with 403 Forbidden
 * - Role comparison is case-insensitive ("admin", "Admin", "ADMIN")
 */

export const requireAdmin = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const userRole = (req.user.role || "").trim().toLowerCase();

        if (userRole !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access required. This endpoint is restricted to Administrators."
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Authorization check failed"
        });
    }
};

export default requireAdmin;
