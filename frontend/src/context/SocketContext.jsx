import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [token, setToken] = useState(() => localStorage.getItem("taskflow_token"));
    const listenersRef = useRef(new Map());
    const wasDisconnectedRef = useRef(false);

    // Watch for token changes (storage across tabs, custom auth events, or programmatic changes)
    useEffect(() => {
        const syncToken = () => {
            const currentToken = localStorage.getItem("taskflow_token");
            setToken((prev) => (prev !== currentToken ? currentToken : prev));
        };

        window.addEventListener("storage", syncToken);
        window.addEventListener("taskflow_auth_change", syncToken);
        const interval = setInterval(syncToken, 1000);

        return () => {
            window.removeEventListener("storage", syncToken);
            window.removeEventListener("taskflow_auth_change", syncToken);
            clearInterval(interval);
        };
    }, []);

    // Derive backend socket URL from VITE_API_BASE_URL
    const getSocketUrl = () => {
        const apiUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
        return apiUrl.replace(/\/api\/?$/, "");
    };

    // Initialize & manage socket connection whenever token changes
    useEffect(() => {
        if (!token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
                setIsConnected(false);
            }
            return;
        }

        const socketUrl = getSocketUrl();
        const socketInstance = io(socketUrl, {
            auth: { token },
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });

        socketInstance.on("connect", () => {
            setIsConnected(true);
            if (wasDisconnectedRef.current) {
                // Trigger reconnect callbacks
                listenersRef.current.get("reconnect")?.forEach((cb) => {
                    try { cb(); } catch (err) { console.error("Reconnect handler error:", err); }
                });
                wasDisconnectedRef.current = false;
            }
        });

        socketInstance.on("disconnect", (reason) => {
            setIsConnected(false);
            wasDisconnectedRef.current = true;
        });

        socketInstance.on("connect_error", (error) => {
            setIsConnected(false);
            wasDisconnectedRef.current = true;
        });

        // Global event dispatcher for subscribed listeners
        socketInstance.on("taskflow:event", (event) => {
            // 1. Notify specific event listeners (e.g. 'task.updated')
            if (event?.type && listenersRef.current.has(event.type)) {
                listenersRef.current.get(event.type).forEach((cb) => {
                    try { cb(event); } catch (err) { console.error("Event handler error:", err); }
                });
            }

            // 2. Notify wildcard listeners ('*')
            if (listenersRef.current.has("*")) {
                listenersRef.current.get("*").forEach((cb) => {
                    try { cb(event); } catch (err) { console.error("Wildcard handler error:", err); }
                });
            }
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
            setSocket(null);
            setIsConnected(false);
        };
    }, [token]);

    // Subscribe to events
    const subscribe = useCallback((eventType, callback) => {
        if (!eventType || typeof callback !== "function") return () => {};

        if (!listenersRef.current.has(eventType)) {
            listenersRef.current.set(eventType, new Set());
        }
        listenersRef.current.get(eventType).add(callback);

        return () => {
            listenersRef.current.get(eventType)?.delete(callback);
            if (listenersRef.current.get(eventType)?.size === 0) {
                listenersRef.current.delete(eventType);
            }
        };
    }, []);

    // Join / leave specific room dynamically
    const joinProject = useCallback((projectId) => {
        if (socket?.connected && projectId) {
            socket.emit("join:project", projectId);
        }
    }, [socket]);

    const leaveProject = useCallback((projectId) => {
        if (socket?.connected && projectId) {
            socket.emit("leave:project", projectId);
        }
    }, [socket]);

    const value = {
        socket,
        isConnected,
        subscribe,
        joinProject,
        leaveProject
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error("useSocket must be used within a SocketProvider");
    }
    return context;
};

// Custom hook to subscribe to specific socket events with automatic cleanup
export const useSocketEvent = (eventType, handler, deps = []) => {
    const { subscribe } = useSocket();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const unsubscribe = subscribe(eventType, (data) => {
            handlerRef.current?.(data);
        });
        return unsubscribe;
    }, [eventType, subscribe, ...deps]);
};

export default SocketContext;
