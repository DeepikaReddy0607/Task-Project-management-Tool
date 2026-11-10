/**
 * In-memory sliding-window rate limiter middleware for authentication routes.
 * Protects login, registration, and password-reset endpoints from brute-force attacks.
 */

export const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 10,
    message = "Too many requests. Please try again later.",
    keyGenerator = (req) => {
        const forwarded = req.headers["x-forwarded-for"];
        const ip = forwarded
            ? String(forwarded).split(",")[0].trim()
            : req.socket?.remoteAddress || req.ip || "unknown";
        return ip;
    }
} = {}) => {
    // Map of key -> array of timestamps (epoch ms)
    const hits = new Map();

    const limiter = (req, res, next) => {
        if (process.env.DISABLE_RATE_LIMITING === "true") {
            return next();
        }

        const key = keyGenerator(req);
        const now = Date.now();
        const windowStart = now - windowMs;

        let timestamps = hits.get(key) || [];
        timestamps = timestamps.filter((t) => t > windowStart);

        if (timestamps.length >= max) {
            const earliest = timestamps[0];
            const retryAfterSec = Math.max(1, Math.ceil((earliest + windowMs - now) / 1000));
            res.setHeader("Retry-After", retryAfterSec);
            return res.status(429).json({
                message,
                retryAfter: retryAfterSec
            });
        }

        timestamps.push(now);
        hits.set(key, timestamps);

        // Periodic cleanup of stale entries if map grows
        if (hits.size > 10000) {
            for (const [k, v] of hits.entries()) {
                const valid = v.filter((t) => t > windowStart);
                if (valid.length === 0) hits.delete(k);
                else hits.set(k, valid);
            }
        }

        next();
    };

    limiter.reset = () => {
        hits.clear();
    };

    limiter.getKeyCount = (key) => {
        const now = Date.now();
        const windowStart = now - windowMs;
        const list = (hits.get(key) || []).filter((t) => t > windowStart);
        return list.length;
    };

    return limiter;
};

// Sensible production rate limiters for authentication endpoints
export const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                  // 10 attempts per 15 min per IP
    message: "Too many login attempts. Please try again later."
});

export const registerRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,                  // 10 registrations per hour per IP
    message: "Too many accounts created from this IP. Please try again later."
});

export const forgotPasswordRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                   // 5 requests per 15 min per IP
    message: "Too many password reset requests. Please try again later."
});

export const otpVerifyRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,                  // 15 verification attempts per 15 min per IP
    message: "Too many verification attempts from this IP. Please try again later."
});

export const otpResendRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 6,                   // 6 resend requests per 15 min per IP
    message: "Too many OTP resend requests from this IP. Please try again later."
});
