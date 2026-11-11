import crypto from "node:crypto";

/**
 * In-memory sliding-window rate limiter middleware for authentication routes.
 * Protects login, registration, and password-reset endpoints from brute-force attacks.
 */

export const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 10,
    message = "Too many requests. Please try again later.",
    keyGenerator = (req) => {
        // When trust proxy is enabled, req.ip is securely determined by Express based on trusted proxy hops.
        return req.ip || (req.headers["x-forwarded-for"]
            ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
            : req.socket?.remoteAddress) || "unknown";
    },
    skip = (req) => false,
    ignoreStatuses = []
} = {}) => {
    // Map of key -> array of { id: string, timestamp: number }
    const hits = new Map();

    const limiter = (req, res, next) => {
        if (process.env.DISABLE_RATE_LIMITING === "true") {
            return next();
        }

        if (skip(req)) {
            return next();
        }

        const key = keyGenerator(req);
        if (!key) {
            return next();
        }

        const now = Date.now();
        const windowStart = now - windowMs;

        let entries = hits.get(key) || [];
        entries = entries.filter((e) => e.timestamp > windowStart);

        if (entries.length >= max) {
            const earliest = entries[0].timestamp;
            const retryAfterSec = Math.max(1, Math.ceil((earliest + windowMs - now) / 1000));
            res.setHeader("Retry-After", retryAfterSec);
            return res.status(429).json({
                message,
                retryAfter: retryAfterSec
            });
        }

        const entryId = crypto.randomUUID();
        entries.push({ id: entryId, timestamp: now });
        hits.set(key, entries);

        // If ignoreStatuses is configured, refund the recorded hit when response finishes with an ignored status code
        if (ignoreStatuses && ignoreStatuses.length > 0) {
            res.on("finish", () => {
                if (ignoreStatuses.includes(res.statusCode)) {
                    const currentList = hits.get(key) || [];
                    const idx = currentList.findIndex((item) => item.id === entryId);
                    if (idx !== -1) {
                        currentList.splice(idx, 1);
                        if (currentList.length === 0) hits.delete(key);
                        else hits.set(key, currentList);
                    }
                }
            });
        }

        // Periodic cleanup of stale entries if map grows
        if (hits.size > 10000) {
            for (const [k, v] of hits.entries()) {
                const valid = v.filter((e) => e.timestamp > windowStart);
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
        const list = (hits.get(key) || []).filter((e) => e.timestamp > windowStart);
        return list.length;
    };

    return limiter;
};

// Phase 7.6: Increased IP-based login limit to 30 attempts per 15 minutes.
// Successful authentications (200), malformed requests (400), and internal server errors (500)
// are refunded and do not consume failed-attempt quota.
export const loginRateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,                  // 30 attempts per 15 min per IP
    message: "Too many login attempts. Please try again later.",
    ignoreStatuses: [200, 400, 500]
});

/**
 * Phase 7.6: Account-level failed-login limiter with progressive throttling.
 * Tracks failed authentication attempts per normalized email address.
 *
 * Rules:
 * - Attempts 1-5: unhindered (normal response).
 * - Attempts 6-9: progressive temporary cooldown (15s, 30s, 45s, 60s) to stop automated brute force
 *   without enabling Denial-of-Service attacks against legitimate account owners.
 * - Attempt 10+: 15-minute window cooldown for the target account.
 * - Successful login (HTTP 200): immediately resets account strikes.
 * - Malformed requests (HTTP 400) or server errors (HTTP 500): refunded, zero strikes.
 */
export const createAccountLoginRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    maxFailures = 10,
    throttleThreshold = 5,
    cooldownStepSec = 15,
    maxCooldownSec = 60
} = {}) => {
    // Map: normalizedEmail -> { failures: [ { id: string, timestamp: number } ], lastFailedAt: number }
    const accountFailures = new Map();

    const limiter = (req, res, next) => {
        if (process.env.DISABLE_RATE_LIMITING === "true") {
            return next();
        }

        const email = req.body?.email;
        if (!email || typeof email !== "string") {
            return next();
        }

        const normalizedEmail = email.toLowerCase().trim();
        if (!normalizedEmail) {
            return next();
        }

        const now = Date.now();
        const windowStart = now - windowMs;

        let record = accountFailures.get(normalizedEmail);
        if (record) {
            record.failures = record.failures.filter((f) => f.timestamp > windowStart);
            if (record.failures.length === 0) {
                accountFailures.delete(normalizedEmail);
                record = null;
            }
        }

        const failCount = record ? record.failures.length : 0;

        // Hard limit for repeated failures within the 15-minute window
        if (failCount >= maxFailures) {
            const earliest = record.failures[0].timestamp;
            const retryAfterSec = Math.max(1, Math.ceil((earliest + windowMs - now) / 1000));
            res.setHeader("Retry-After", retryAfterSec);
            return res.status(429).json({
                message: "Too many failed login attempts for this account. Please try again later.",
                retryAfter: retryAfterSec
            });
        }

        // Progressive throttling between throttleThreshold (5) and maxFailures (10)
        if (failCount >= throttleThreshold && record && record.lastFailedAt) {
            const stepMultiplier = failCount - throttleThreshold + 1;
            const cooldownSec = Math.min(maxCooldownSec, stepMultiplier * cooldownStepSec);
            const cooldownMs = cooldownSec * 1000;
            const elapsed = now - record.lastFailedAt;

            if (elapsed < cooldownMs) {
                const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
                res.setHeader("Retry-After", retryAfterSec);
                return res.status(429).json({
                    message: "Too many failed login attempts for this account. Please wait before trying again.",
                    retryAfter: retryAfterSec
                });
            }
        }

        // Capture response outcome to manage failure strikes
        res.on("finish", () => {
            const finishNow = Date.now();
            if (res.statusCode === 200) {
                // Successful authentication resets all strikes for this email
                accountFailures.delete(normalizedEmail);
            } else if (res.statusCode === 401) {
                // Invalid credentials or unverified state records a failure strike
                let current = accountFailures.get(normalizedEmail);
                if (!current) {
                    current = { failures: [], lastFailedAt: finishNow };
                    accountFailures.set(normalizedEmail, current);
                }
                current.failures.push({
                    id: crypto.randomUUID(),
                    timestamp: finishNow
                });
                current.lastFailedAt = finishNow;
            }
            // 400 (bad request), 429 (throttled), 500 (server error) do not record failure strikes
        });

        // Periodic map cleanup
        if (accountFailures.size > 10000) {
            for (const [k, v] of accountFailures.entries()) {
                const valid = v.failures.filter((f) => f.timestamp > windowStart);
                if (valid.length === 0) accountFailures.delete(k);
                else accountFailures.set(k, { ...v, failures: valid });
            }
        }

        next();
    };

    limiter.reset = () => {
        accountFailures.clear();
    };

    limiter.resetAccount = (email) => {
        if (!email) return;
        accountFailures.delete(email.toLowerCase().trim());
    };

    limiter.getAccountFailures = (email) => {
        if (!email) return 0;
        const normalized = email.toLowerCase().trim();
        const now = Date.now();
        const record = accountFailures.get(normalized);
        if (!record) return 0;
        return record.failures.filter((f) => f.timestamp > now - windowMs).length;
    };

    return limiter;
};

export const loginAccountRateLimiter = createAccountLoginRateLimiter();

// Phase 7.5: 30 registration requests per IP per rolling 60-minute window
// Malformed requests (400), duplicate emails (409), and internal server/SMTP errors (500) do not consume quota
export const registerRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,                  // Increased from 10 to 30 requests per rolling 60-minute window
    message: "Too many accounts created from this IP. Please try again later.",
    ignoreStatuses: [400, 409, 500]
});

// Phase 7.5: Email-based registration throttle to prevent repeated attempts against the same email
export const registerEmailRateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,                   // Maximum 5 registration attempts per email address within 60 minutes
    message: "Too many registration attempts for this email address. Please check your inbox or try again later.",
    keyGenerator: (req) => {
        const email = req.body?.email;
        if (!email || typeof email !== "string") return null;
        return email.toLowerCase().trim();
    },
    skip: (req) => !req.body?.email || typeof req.body.email !== "string",
    ignoreStatuses: [400, 409, 500]
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
