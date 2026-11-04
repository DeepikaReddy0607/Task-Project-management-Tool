/**
 * CORS Configuration and Origin Allowlist Management
 */

export const getAllowedOrigins = () => {
    const allowed = new Set();

    if (process.env.FRONTEND_URL) {
        allowed.add(process.env.FRONTEND_URL.replace(/\/+$/, ""));
    }

    if (process.env.ALLOWED_ORIGINS) {
        process.env.ALLOWED_ORIGINS.split(",")
            .map((o) => o.trim().replace(/\/+$/, ""))
            .filter(Boolean)
            .forEach((o) => allowed.add(o));
    }

    // In development and testing, support standard local frontend origins
    if (process.env.NODE_ENV !== "production") {
        allowed.add("http://localhost:5173");
        allowed.add("http://127.0.0.1:5173");
        allowed.add("http://localhost:3000");
    }

    return Array.from(allowed);
};

export const getCorsOptions = () => {
    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, node tests)
            if (!origin) {
                return callback(null, true);
            }

            const allowedOrigins = getAllowedOrigins();
            const normalized = origin.replace(/\/+$/, "");

            if (allowedOrigins.includes(normalized)) {
                return callback(null, true);
            }

            return callback(new Error("CORS policy violation: Origin not allowed"), false);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    };
};
