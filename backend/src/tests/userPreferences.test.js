import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../app.js";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import { shouldDeliverNotification } from "../services/notificationService.js";

describe("PHASE 17: User Preferences & Settings Backend Test Suite", () => {
    let server;
    let baseUrl;
    let userA;
    let userB;
    let tokenA;
    let tokenB;

    before(async () => {
        // Find or create test users
        const role = await prisma.roles.findFirst();
        if (!role) throw new Error("No roles found in database");

        userA = await prisma.users.upsert({
            where: { email: "pref_test_a@taskflow.dev" },
            update: {},
            create: {
                email: "pref_test_a@taskflow.dev",
                first_name: "Alice",
                last_name: "Pref",
                password_hash: "mock_hash",
                role_id: role.id,
            },
        });

        userB = await prisma.users.upsert({
            where: { email: "pref_test_b@taskflow.dev" },
            update: {},
            create: {
                email: "pref_test_b@taskflow.dev",
                first_name: "Bob",
                last_name: "Pref",
                password_hash: "mock_hash",
                role_id: role.id,
            },
        });

        const secret = process.env.JWT_SECRET || "fallback_secret";
        tokenA = jwt.sign({ userId: userA.id, email: userA.email }, secret, { expiresIn: "1h" });
        tokenB = jwt.sign({ userId: userB.id, email: userB.email }, secret, { expiresIn: "1h" });

        // Clean any existing preferences for these test users
        await prisma.user_preferences.deleteMany({
            where: { user_id: { in: [userA.id, userB.id] } },
        });

        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/preferences`;
    });

    after(async () => {
        // Clean up
        await prisma.user_preferences.deleteMany({
            where: { user_id: { in: [userA.id, userB.id] } },
        });
        await prisma.users.deleteMany({
            where: { id: { in: [userA.id, userB.id] } },
        });
        await new Promise((resolve) => server.close(resolve));
    });

    test("1. GET /api/preferences strictly rejects unauthenticated requests with 401", async () => {
        const res = await fetch(baseUrl);
        assert.equal(res.status, 401);
    });

    test("2. GET /api/preferences initializes and returns default preferences for a new user", async () => {
        const res = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${tokenA}` },
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.preferences.theme, "system");
        assert.equal(body.preferences.interfaceDensity, "comfortable");
        assert.equal(body.preferences.sidebarCollapsed, false);
        assert.equal(body.preferences.inAppNotifications, true);
        assert.equal(body.preferences.emailNotifications, true);
        assert.equal(body.preferences.defaultTaskView, "kanban");
        assert.equal(body.preferences.defaultTaskPriority, "Medium");
        assert.equal(body.preferences.showCompletedTasks, true);
        assert.equal(body.preferences.aiRecommendations, true);
    });

    test("3. PATCH /api/preferences updates Appearance settings (Theme & Density)", async () => {
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                theme: "dark",
                interfaceDensity: "compact",
                sidebarCollapsed: true,
            }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.preferences.theme, "dark");
        assert.equal(body.preferences.interfaceDensity, "compact");
        assert.equal(body.preferences.sidebarCollapsed, true);

        // Verify persistence in DB
        const inDb = await prisma.user_preferences.findUnique({
            where: { user_id: userA.id },
        });
        assert.equal(inDb.theme, "dark");
        assert.equal(inDb.interface_density, "compact");
        assert.equal(inDb.sidebar_collapsed, true);
    });

    test("4. PATCH /api/preferences rejects invalid theme with 400 Bad Request", async () => {
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                theme: "invalid_neon_theme",
            }),
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.success, false);
        assert.match(body.message, /Invalid theme/i);
    });

    test("5. PATCH /api/preferences updates Notification and DND settings", async () => {
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                dndEnabled: true,
                quietHoursEnabled: true,
                quietHoursStart: "23:00",
                quietHoursEnd: "07:00",
                taskAssignments: false,
                notificationFrequency: "daily_digest",
            }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.preferences.dndEnabled, true);
        assert.equal(body.preferences.quietHoursEnabled, true);
        assert.equal(body.preferences.quietHoursStart, "23:00");
        assert.equal(body.preferences.quietHoursEnd, "07:00");
        assert.equal(body.preferences.taskAssignments, false);
        assert.equal(body.preferences.notificationFrequency, "daily_digest");
    });

    test("6. PATCH /api/preferences rejects invalid quiet hours format with 400", async () => {
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                quietHoursStart: "midnight",
            }),
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.match(body.message, /quiet hours start/i);
    });

    test("7. PATCH /api/preferences updates Task and Date/Time settings", async () => {
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                defaultTaskView: "calendar",
                defaultTaskPriority: "Urgent",
                defaultTaskSort: "priority",
                dateFormat: "DD/MM/YYYY",
                timeFormat: "24h",
                weekStartsOn: "Sunday",
            }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.preferences.defaultTaskView, "calendar");
        assert.equal(body.preferences.defaultTaskPriority, "Urgent");
        assert.equal(body.preferences.defaultTaskSort, "priority");
        assert.equal(body.preferences.dateFormat, "DD/MM/YYYY");
        assert.equal(body.preferences.timeFormat, "24h");
        assert.equal(body.preferences.weekStartsOn, "Sunday");
    });

    test("8. PATCH /api/preferences enforces workspace membership authorization", async () => {
        const fakeWorkspaceId = "00000000-0000-0000-0000-000000000000";
        const res = await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                defaultWorkspaceId: fakeWorkspaceId,
            }),
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.match(body.message, /access to the selected workspace/i);
    });

    test("9. User Isolation: User A's modifications do NOT leak or affect User B", async () => {
        // User B fetches preferences
        const resB = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${tokenB}` },
        });
        assert.equal(resB.status, 200);
        const bodyB = await resB.json();

        // User B should still have factory defaults, NOT User A's dark theme or urgent task priority
        assert.equal(bodyB.preferences.theme, "system");
        assert.equal(bodyB.preferences.interfaceDensity, "comfortable");
        assert.equal(bodyB.preferences.defaultTaskPriority, "Medium");
        assert.equal(bodyB.preferences.dndEnabled, false);
    });

    test("10. Notification integration: shouldDeliverNotification honors user preferences", async () => {
        // User A has dndEnabled: true
        const allowedDnd = await shouldDeliverNotification(userA.id, "TASK_ASSIGNED");
        assert.equal(allowedDnd, false, "Notification should be suppressed when DND is enabled");

        // Turn DND off for User A but disable task assignments
        await fetch(baseUrl, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${tokenA}`,
            },
            body: JSON.stringify({
                dndEnabled: false,
                taskAssignments: false,
                projectUpdates: true,
            }),
        });

        const allowedTaskAssigned = await shouldDeliverNotification(userA.id, "TASK_ASSIGNED");
        assert.equal(allowedTaskAssigned, false, "TASK_ASSIGNED should be suppressed when taskAssignments preference is false");

        const allowedProjectUpdate = await shouldDeliverNotification(userA.id, "PROJECT_UPDATED");
        assert.equal(allowedProjectUpdate, true, "PROJECT_UPDATED should be allowed when projectUpdates preference is true");
    });

    test("11. POST /api/preferences/reset restores all user preferences back to factory defaults", async () => {
        const res = await fetch(`${baseUrl}/reset`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenA}` },
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.preferences.theme, "system");
        assert.equal(body.preferences.interfaceDensity, "comfortable");
        assert.equal(body.preferences.sidebarCollapsed, false);
        assert.equal(body.preferences.defaultTaskView, "kanban");
        assert.equal(body.preferences.defaultTaskPriority, "Medium");
        assert.equal(body.preferences.dndEnabled, false);
        assert.equal(body.preferences.taskAssignments, true);

        // Verify in DB
        const inDb = await prisma.user_preferences.findUnique({
            where: { user_id: userA.id },
        });
        assert.equal(inDb.theme, "system");
        assert.equal(inDb.interface_density, "comfortable");
    });
});
