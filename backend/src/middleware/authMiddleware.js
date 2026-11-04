import jwt from "jsonwebtoken";

// Fast-path JWT verification cache (LRU / TTL)
// Mitigates synchronous HMAC-SHA256 event loop blocking on high-frequency requests
const tokenCache = new Map();
const revokedUsers = new Set();
const MAX_CACHE_SIZE = 5000;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds max TTL

function getCacheKey(token) {
    const secret = process.env.JWT_SECRET || "";
    return `${secret}:${token}`;
}

export function clearTokenCache() {
    tokenCache.clear();
    revokedUsers.clear();
}

export function invalidateToken(token) {
    if (!token) return;
    const key = getCacheKey(token);
    tokenCache.delete(key);
}

export function invalidateUserTokens(userId) {
    if (!userId) return;
    for (const [key, value] of tokenCache.entries()) {
        const uId = value.decoded?.userId || value.decoded?.id;
        if (uId === userId) {
            tokenCache.delete(key);
        }
    }
}

export function revokeUser(userId) {
    if (!userId) return;
    revokedUsers.add(userId);
    invalidateUserTokens(userId);
}

export function unrevokeUser(userId) {
    if (!userId) return;
    revokedUsers.delete(userId);
    invalidateUserTokens(userId);
}

export function getTokenCacheStats() {
    return {
        size: tokenCache.size,
        maxSize: MAX_CACHE_SIZE,
        revokedUsersCount: revokedUsers.size
    };
}

const authMiddleware = (req, res, next) => {
    try {
        // Get Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Authentication token required"
            });
        }

        // Expected format:
        // Authorization: Bearer <token>
        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                message: "Invalid authentication format"
            });
        }

        const token = parts[1];
        const cacheKey = getCacheKey(token);
        const now = Date.now();

        let decoded;
        const cached = tokenCache.get(cacheKey);

        if (cached) {
            const expMs = cached.decoded?.exp ? cached.decoded.exp * 1000 : Infinity;
            if (cached.expiresAt <= now || expMs <= now) {
                tokenCache.delete(cacheKey);
                // Fall through to jwt.verify which will throw TokenExpiredError
            } else {
                const uId = cached.decoded?.userId || cached.decoded?.id;
                if (uId && revokedUsers.has(uId)) {
                    tokenCache.delete(cacheKey);
                    return res.status(401).json({
                        message: "User account is inactive or revoked"
                    });
                }
                decoded = cached.decoded;
            }
        }

        if (!decoded) {
            // Cryptographic JWT verification
            decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            );

            const uId = decoded.userId || decoded.id;
            if (uId && revokedUsers.has(uId)) {
                return res.status(401).json({
                    message: "User account is inactive or revoked"
                });
            }

            // Safe bounded cache entry: only cache if remaining validity is positive
            const tokenExpMs = decoded.exp ? decoded.exp * 1000 : now + 60000;
            const remainingValidity = tokenExpMs - now;

            if (remainingValidity > 1000) {
                if (tokenCache.size >= MAX_CACHE_SIZE) {
                    const oldestKey = tokenCache.keys().next().value;
                    tokenCache.delete(oldestKey);
                }
                tokenCache.set(cacheKey, {
                    decoded: Object.freeze({ ...decoded }),
                    expiresAt: Math.min(now + CACHE_TTL_MS, tokenExpMs)
                });
            }
        }

        // Store decoded user information (shallow copy to isolate request mutations)
        req.user = { ...decoded };
        if (req.user) {
            if (!req.user.id && req.user.userId) {
                req.user.id = req.user.userId;
            }
            if (!req.user.userId && req.user.id) {
                req.user.userId = req.user.id;
            }
        }

        // Continue to the next middleware/controller
        next();

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                message: "Authentication token expired"
            });
        }

        return res.status(401).json({
            message: "Invalid authentication token"
        });
    }
};

export default authMiddleware;
