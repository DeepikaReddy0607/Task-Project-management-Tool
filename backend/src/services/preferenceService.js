import prisma from "../config/prisma.js";
import { emitRealtimeEvent } from "../socket.js";

export const DEFAULT_PREFERENCES = {
    theme: "system",
    interfaceDensity: "comfortable",
    sidebarCollapsed: false,
    dashboardLayout: "default",

    // Notifications
    inAppNotifications: true,
    emailNotifications: true,
    taskAssignments: true,
    deadlineReminders: true,
    taskStatusUpdates: true,
    mentionsAndComments: true,
    projectUpdates: true,
    workspaceActivity: true,
    riskAlerts: true,
    aiRecommendationsNotif: true,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    dndEnabled: false,
    notificationFrequency: "immediate",

    // Tasks
    defaultTaskView: "kanban",
    defaultTaskPriority: "Medium",
    defaultTaskSort: "due_date",
    showCompletedTasks: true,
    defaultTaskFilter: "all",
    weekStartsOn: "Monday",

    // Workspace
    defaultWorkspaceId: null,
    defaultLandingPage: "dashboard",
    rememberLastWorkspace: true,
    rememberLastProject: true,
    lastWorkspaceId: null,
    lastProjectId: null,

    // Date & Time
    timezone: "UTC",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "12h",

    // AI & Intelligence
    aiRecommendations: true,
    proactiveInsights: true,
    aiTaskSuggestions: true,
    aiGeneratedSummaries: true,
    quackieSuggestions: true,
    aiInsightFrequency: "medium",

    // Privacy & Personalization
    profileVisibility: "team",
    activityVisibility: "team",
    personalizedDashboard: true,
    personalizedRecommendations: true,
};

export const normalizeFromDb = (record) => {
    if (!record) return { ...DEFAULT_PREFERENCES };
    return {
        id: record.id,
        userId: record.user_id,
        theme: record.theme ?? DEFAULT_PREFERENCES.theme,
        interfaceDensity: record.interface_density ?? DEFAULT_PREFERENCES.interfaceDensity,
        sidebarCollapsed: Boolean(record.sidebar_collapsed),
        dashboardLayout: record.dashboard_layout ?? DEFAULT_PREFERENCES.dashboardLayout,

        inAppNotifications: Boolean(record.in_app_notifications),
        emailNotifications: Boolean(record.email_notifications),
        taskAssignments: Boolean(record.task_assignments),
        deadlineReminders: Boolean(record.deadline_reminders),
        taskStatusUpdates: Boolean(record.task_status_updates),
        mentionsAndComments: Boolean(record.mentions_and_comments),
        projectUpdates: Boolean(record.project_updates),
        workspaceActivity: Boolean(record.workspace_activity),
        riskAlerts: Boolean(record.risk_alerts),
        aiRecommendationsNotif: Boolean(record.ai_recommendations_notif),
        quietHoursEnabled: Boolean(record.quiet_hours_enabled),
        quietHoursStart: record.quiet_hours_start ?? DEFAULT_PREFERENCES.quietHoursStart,
        quietHoursEnd: record.quiet_hours_end ?? DEFAULT_PREFERENCES.quietHoursEnd,
        dndEnabled: Boolean(record.dnd_enabled),
        notificationFrequency: record.notification_frequency ?? DEFAULT_PREFERENCES.notificationFrequency,

        defaultTaskView: record.default_task_view ?? DEFAULT_PREFERENCES.defaultTaskView,
        defaultTaskPriority: record.default_task_priority ?? DEFAULT_PREFERENCES.defaultTaskPriority,
        defaultTaskSort: record.default_task_sort ?? DEFAULT_PREFERENCES.defaultTaskSort,
        showCompletedTasks: Boolean(record.show_completed_tasks),
        defaultTaskFilter: record.default_task_filter ?? DEFAULT_PREFERENCES.defaultTaskFilter,
        weekStartsOn: record.week_starts_on ?? DEFAULT_PREFERENCES.weekStartsOn,

        defaultWorkspaceId: record.default_workspace_id ?? null,
        defaultLandingPage: record.default_landing_page ?? DEFAULT_PREFERENCES.defaultLandingPage,
        rememberLastWorkspace: Boolean(record.remember_last_workspace),
        rememberLastProject: Boolean(record.remember_last_project),
        lastWorkspaceId: record.last_workspace_id ?? null,
        lastProjectId: record.last_project_id ?? null,

        timezone: record.timezone ?? DEFAULT_PREFERENCES.timezone,
        dateFormat: record.date_format ?? DEFAULT_PREFERENCES.dateFormat,
        timeFormat: record.time_format ?? DEFAULT_PREFERENCES.timeFormat,

        aiRecommendations: Boolean(record.ai_recommendations),
        proactiveInsights: Boolean(record.proactive_insights),
        aiTaskSuggestions: Boolean(record.ai_task_suggestions),
        aiGeneratedSummaries: Boolean(record.ai_generated_summaries),
        quackieSuggestions: Boolean(record.quackie_suggestions),
        aiInsightFrequency: record.ai_insight_frequency ?? DEFAULT_PREFERENCES.aiInsightFrequency,

        profileVisibility: record.profile_visibility ?? DEFAULT_PREFERENCES.profileVisibility,
        activityVisibility: record.activity_visibility ?? DEFAULT_PREFERENCES.activityVisibility,
        personalizedDashboard: Boolean(record.personalized_dashboard),
        personalizedRecommendations: Boolean(record.personalized_recommendations),

        createdAt: record.created_at,
        updatedAt: record.updated_at,
    };
};

export const getUserPreferences = async (userId) => {
    if (!userId) throw new Error("User ID is required to fetch preferences");

    let record = await prisma.user_preferences.findUnique({
        where: { user_id: userId },
    });

    if (!record) {
        // Create default record in DB
        try {
            record = await prisma.user_preferences.create({
                data: {
                    user_id: userId,
                    theme: DEFAULT_PREFERENCES.theme,
                    interface_density: DEFAULT_PREFERENCES.interfaceDensity,
                    sidebar_collapsed: DEFAULT_PREFERENCES.sidebarCollapsed,
                    dashboard_layout: DEFAULT_PREFERENCES.dashboardLayout,
                    in_app_notifications: DEFAULT_PREFERENCES.inAppNotifications,
                    email_notifications: DEFAULT_PREFERENCES.emailNotifications,
                    task_assignments: DEFAULT_PREFERENCES.taskAssignments,
                    deadline_reminders: DEFAULT_PREFERENCES.deadlineReminders,
                    task_status_updates: DEFAULT_PREFERENCES.taskStatusUpdates,
                    mentions_and_comments: DEFAULT_PREFERENCES.mentionsAndComments,
                    project_updates: DEFAULT_PREFERENCES.projectUpdates,
                    workspace_activity: DEFAULT_PREFERENCES.workspaceActivity,
                    risk_alerts: DEFAULT_PREFERENCES.riskAlerts,
                    ai_recommendations_notif: DEFAULT_PREFERENCES.aiRecommendationsNotif,
                    quiet_hours_enabled: DEFAULT_PREFERENCES.quietHoursEnabled,
                    quiet_hours_start: DEFAULT_PREFERENCES.quietHoursStart,
                    quiet_hours_end: DEFAULT_PREFERENCES.quietHoursEnd,
                    dnd_enabled: DEFAULT_PREFERENCES.dndEnabled,
                    notification_frequency: DEFAULT_PREFERENCES.notificationFrequency,
                    default_task_view: DEFAULT_PREFERENCES.defaultTaskView,
                    default_task_priority: DEFAULT_PREFERENCES.defaultTaskPriority,
                    default_task_sort: DEFAULT_PREFERENCES.defaultTaskSort,
                    show_completed_tasks: DEFAULT_PREFERENCES.showCompletedTasks,
                    default_task_filter: DEFAULT_PREFERENCES.defaultTaskFilter,
                    week_starts_on: DEFAULT_PREFERENCES.weekStartsOn,
                    default_landing_page: DEFAULT_PREFERENCES.defaultLandingPage,
                    remember_last_workspace: DEFAULT_PREFERENCES.rememberLastWorkspace,
                    remember_last_project: DEFAULT_PREFERENCES.rememberLastProject,
                    timezone: DEFAULT_PREFERENCES.timezone,
                    date_format: DEFAULT_PREFERENCES.dateFormat,
                    time_format: DEFAULT_PREFERENCES.timeFormat,
                    ai_recommendations: DEFAULT_PREFERENCES.aiRecommendations,
                    proactive_insights: DEFAULT_PREFERENCES.proactiveInsights,
                    ai_task_suggestions: DEFAULT_PREFERENCES.aiTaskSuggestions,
                    ai_generated_summaries: DEFAULT_PREFERENCES.aiGeneratedSummaries,
                    quackie_suggestions: DEFAULT_PREFERENCES.quackieSuggestions,
                    ai_insight_frequency: DEFAULT_PREFERENCES.aiInsightFrequency,
                    profile_visibility: DEFAULT_PREFERENCES.profileVisibility,
                    activity_visibility: DEFAULT_PREFERENCES.activityVisibility,
                    personalized_dashboard: DEFAULT_PREFERENCES.personalizedDashboard,
                    personalized_recommendations: DEFAULT_PREFERENCES.personalizedRecommendations,
                },
            });
        } catch {
            // In case of race condition on first load
            record = await prisma.user_preferences.findUnique({
                where: { user_id: userId },
            });
        }
    }

    return normalizeFromDb(record);
};

export const validatePreferenceUpdates = async (userId, updates) => {
    const validThemes = ["light", "dark", "system"];
    const validDensities = ["comfortable", "compact"];
    const validLayouts = ["default", "personalized"];
    const validFrequencies = ["immediate", "daily_digest", "weekly_summary"];
    const validTaskViews = ["kanban", "list", "calendar"];
    const validPriorities = ["Low", "Medium", "High", "Urgent"];
    const validSorts = ["due_date", "priority", "created_at"];
    const validFilters = ["all", "assigned_to_me"];
    const validWeekStarts = ["Sunday", "Monday"];
    const validLandingPages = ["dashboard", "tasks", "projects"];
    const validDateFormats = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
    const validTimeFormats = ["12h", "24h"];
    const validAiFrequencies = ["low", "medium", "high"];
    const validVisibilities = ["public", "team", "private"];
    const validActivityVisibilities = ["everyone", "team", "private"];

    const dbData = {};

    // 1. Appearance
    if (updates.theme !== undefined) {
        if (!validThemes.includes(updates.theme)) {
            throw new Error(`Invalid theme. Allowed values: ${validThemes.join(", ")}`);
        }
        dbData.theme = updates.theme;
    }

    if (updates.interfaceDensity !== undefined || updates.interface_density !== undefined) {
        const val = updates.interfaceDensity ?? updates.interface_density;
        if (!validDensities.includes(val)) {
            throw new Error(`Invalid interface density. Allowed values: ${validDensities.join(", ")}`);
        }
        dbData.interface_density = val;
    }

    if (updates.sidebarCollapsed !== undefined || updates.sidebar_collapsed !== undefined) {
        dbData.sidebar_collapsed = Boolean(updates.sidebarCollapsed ?? updates.sidebar_collapsed);
    }

    if (updates.dashboardLayout !== undefined || updates.dashboard_layout !== undefined) {
        const val = updates.dashboardLayout ?? updates.dashboard_layout;
        if (!validLayouts.includes(val)) {
            throw new Error(`Invalid dashboard layout. Allowed values: ${validLayouts.join(", ")}`);
        }
        dbData.dashboard_layout = val;
    }

    // 2. Notifications
    const boolNotifFields = [
        ["inAppNotifications", "in_app_notifications"],
        ["emailNotifications", "email_notifications"],
        ["taskAssignments", "task_assignments"],
        ["deadlineReminders", "deadline_reminders"],
        ["taskStatusUpdates", "task_status_updates"],
        ["mentionsAndComments", "mentions_and_comments"],
        ["projectUpdates", "project_updates"],
        ["workspaceActivity", "workspace_activity"],
        ["riskAlerts", "risk_alerts"],
        ["aiRecommendationsNotif", "ai_recommendations_notif"],
        ["quietHoursEnabled", "quiet_hours_enabled"],
        ["dndEnabled", "dnd_enabled"],
    ];

    for (const [camel, snake] of boolNotifFields) {
        if (updates[camel] !== undefined || updates[snake] !== undefined) {
            dbData[snake] = Boolean(updates[camel] ?? updates[snake]);
        }
    }

    if (updates.quietHoursStart !== undefined || updates.quiet_hours_start !== undefined) {
        const val = updates.quietHoursStart ?? updates.quiet_hours_start;
        if (typeof val !== "string" || !/^\d{2}:\d{2}$/.test(val)) {
            throw new Error("Invalid quiet hours start format. Use HH:MM");
        }
        dbData.quiet_hours_start = val;
    }

    if (updates.quietHoursEnd !== undefined || updates.quiet_hours_end !== undefined) {
        const val = updates.quietHoursEnd ?? updates.quiet_hours_end;
        if (typeof val !== "string" || !/^\d{2}:\d{2}$/.test(val)) {
            throw new Error("Invalid quiet hours end format. Use HH:MM");
        }
        dbData.quiet_hours_end = val;
    }

    if (updates.notificationFrequency !== undefined || updates.notification_frequency !== undefined) {
        const val = updates.notificationFrequency ?? updates.notification_frequency;
        if (!validFrequencies.includes(val)) {
            throw new Error(`Invalid notification frequency. Allowed: ${validFrequencies.join(", ")}`);
        }
        dbData.notification_frequency = val;
    }

    // 3. Tasks
    if (updates.defaultTaskView !== undefined || updates.default_task_view !== undefined) {
        const val = updates.defaultTaskView ?? updates.default_task_view;
        if (!validTaskViews.includes(val)) {
            throw new Error(`Invalid default task view. Allowed: ${validTaskViews.join(", ")}`);
        }
        dbData.default_task_view = val;
    }

    if (updates.defaultTaskPriority !== undefined || updates.default_task_priority !== undefined) {
        const val = updates.defaultTaskPriority ?? updates.default_task_priority;
        if (!validPriorities.includes(val)) {
            throw new Error(`Invalid default task priority. Allowed: ${validPriorities.join(", ")}`);
        }
        dbData.default_task_priority = val;
    }

    if (updates.defaultTaskSort !== undefined || updates.default_task_sort !== undefined) {
        const val = updates.defaultTaskSort ?? updates.default_task_sort;
        if (!validSorts.includes(val)) {
            throw new Error(`Invalid default task sort. Allowed: ${validSorts.join(", ")}`);
        }
        dbData.default_task_sort = val;
    }

    if (updates.showCompletedTasks !== undefined || updates.show_completed_tasks !== undefined) {
        dbData.show_completed_tasks = Boolean(updates.showCompletedTasks ?? updates.show_completed_tasks);
    }

    if (updates.defaultTaskFilter !== undefined || updates.default_task_filter !== undefined) {
        const val = updates.defaultTaskFilter ?? updates.default_task_filter;
        if (!validFilters.includes(val)) {
            throw new Error(`Invalid default task filter. Allowed: ${validFilters.join(", ")}`);
        }
        dbData.default_task_filter = val;
    }

    if (updates.weekStartsOn !== undefined || updates.week_starts_on !== undefined) {
        const val = updates.weekStartsOn ?? updates.week_starts_on;
        if (!validWeekStarts.includes(val)) {
            throw new Error(`Invalid week starts on. Allowed: ${validWeekStarts.join(", ")}`);
        }
        dbData.week_starts_on = val;
    }

    // 4. Workspace
    if (updates.defaultLandingPage !== undefined || updates.default_landing_page !== undefined) {
        const val = updates.defaultLandingPage ?? updates.default_landing_page;
        if (!validLandingPages.includes(val)) {
            throw new Error(`Invalid default landing page. Allowed: ${validLandingPages.join(", ")}`);
        }
        dbData.default_landing_page = val;
    }

    if (updates.rememberLastWorkspace !== undefined || updates.remember_last_workspace !== undefined) {
        dbData.remember_last_workspace = Boolean(updates.rememberLastWorkspace ?? updates.remember_last_workspace);
    }

    if (updates.rememberLastProject !== undefined || updates.remember_last_project !== undefined) {
        dbData.remember_last_project = Boolean(updates.rememberLastProject ?? updates.remember_last_project);
    }

    // Workspace ID validation: ensure user belongs to this workspace
    const checkWorkspaceAccess = async (wsId) => {
        if (!wsId) return;
        const membership = await prisma.workspace_members.findFirst({
            where: { workspace_id: wsId, user_id: userId },
        });
        const isOwner = await prisma.workspaces.findFirst({
            where: { id: wsId, owner_id: userId },
        });
        if (!membership && !isOwner) {
            throw new Error("You do not have access to the selected workspace.");
        }
    };

    if (updates.defaultWorkspaceId !== undefined || updates.default_workspace_id !== undefined) {
        const wsId = updates.defaultWorkspaceId ?? updates.default_workspace_id;
        if (wsId) {
            await checkWorkspaceAccess(wsId);
            dbData.default_workspace_id = wsId;
        } else {
            dbData.default_workspace_id = null;
        }
    }

    if (updates.lastWorkspaceId !== undefined || updates.last_workspace_id !== undefined) {
        const wsId = updates.lastWorkspaceId ?? updates.last_workspace_id;
        if (wsId) {
            await checkWorkspaceAccess(wsId);
            dbData.last_workspace_id = wsId;
        } else {
            dbData.last_workspace_id = null;
        }
    }

    if (updates.lastProjectId !== undefined || updates.last_project_id !== undefined) {
        const pId = updates.lastProjectId ?? updates.last_project_id;
        if (pId) {
            const project = await prisma.projects.findUnique({
                where: { id: pId },
                include: { workspaces: true },
            });
            if (!project) throw new Error("Project not found");
            await checkWorkspaceAccess(project.workspace_id);
            dbData.last_project_id = pId;
        } else {
            dbData.last_project_id = null;
        }
    }

    // 5. Date & Time
    if (updates.timezone !== undefined) {
        if (typeof updates.timezone !== "string" || !updates.timezone.trim()) {
            throw new Error("Timezone cannot be empty");
        }
        dbData.timezone = updates.timezone.trim();
    }

    if (updates.dateFormat !== undefined || updates.date_format !== undefined) {
        const val = updates.dateFormat ?? updates.date_format;
        if (!validDateFormats.includes(val)) {
            throw new Error(`Invalid date format. Allowed: ${validDateFormats.join(", ")}`);
        }
        dbData.date_format = val;
    }

    if (updates.timeFormat !== undefined || updates.time_format !== undefined) {
        const val = updates.timeFormat ?? updates.time_format;
        if (!validTimeFormats.includes(val)) {
            throw new Error(`Invalid time format. Allowed: ${validTimeFormats.join(", ")}`);
        }
        dbData.time_format = val;
    }

    // 6. AI & Intelligence
    const boolAiFields = [
        ["aiRecommendations", "ai_recommendations"],
        ["proactiveInsights", "proactive_insights"],
        ["aiTaskSuggestions", "ai_task_suggestions"],
        ["aiGeneratedSummaries", "ai_generated_summaries"],
        ["quackieSuggestions", "quackie_suggestions"],
    ];

    for (const [camel, snake] of boolAiFields) {
        if (updates[camel] !== undefined || updates[snake] !== undefined) {
            dbData[snake] = Boolean(updates[camel] ?? updates[snake]);
        }
    }

    if (updates.aiInsightFrequency !== undefined || updates.ai_insight_frequency !== undefined) {
        const val = updates.aiInsightFrequency ?? updates.ai_insight_frequency;
        if (!validAiFrequencies.includes(val)) {
            throw new Error(`Invalid AI insight frequency. Allowed: ${validAiFrequencies.join(", ")}`);
        }
        dbData.ai_insight_frequency = val;
    }

    // 7. Privacy & Personalization
    if (updates.profileVisibility !== undefined || updates.profile_visibility !== undefined) {
        const val = updates.profileVisibility ?? updates.profile_visibility;
        if (!validVisibilities.includes(val)) {
            throw new Error(`Invalid profile visibility. Allowed: ${validVisibilities.join(", ")}`);
        }
        dbData.profile_visibility = val;
    }

    if (updates.activityVisibility !== undefined || updates.activity_visibility !== undefined) {
        const val = updates.activityVisibility ?? updates.activity_visibility;
        if (!validActivityVisibilities.includes(val)) {
            throw new Error(`Invalid activity visibility. Allowed: ${validActivityVisibilities.join(", ")}`);
        }
        dbData.activity_visibility = val;
    }

    if (updates.personalizedDashboard !== undefined || updates.personalized_dashboard !== undefined) {
        dbData.personalized_dashboard = Boolean(updates.personalizedDashboard ?? updates.personalized_dashboard);
    }

    if (updates.personalizedRecommendations !== undefined || updates.personalized_recommendations !== undefined) {
        dbData.personalized_recommendations = Boolean(updates.personalizedRecommendations ?? updates.personalized_recommendations);
    }

    return dbData;
};

export const updateUserPreferences = async (userId, updates) => {
    if (!userId) throw new Error("User ID is required to update preferences");

    const validatedData = await validatePreferenceUpdates(userId, updates);
    validatedData.updated_at = new Date();

    const record = await prisma.user_preferences.upsert({
        where: { user_id: userId },
        update: validatedData,
        create: {
            user_id: userId,
            ...validatedData,
        },
    });

    const normalized = normalizeFromDb(record);

    // Emit realtime event to the user's private channel
    emitRealtimeEvent({
        type: "user.preferences_updated",
        userId,
        data: normalized,
    });

    return normalized;
};

export const resetUserPreferences = async (userId) => {
    if (!userId) throw new Error("User ID is required to reset preferences");

    const resetData = {
        theme: DEFAULT_PREFERENCES.theme,
        interface_density: DEFAULT_PREFERENCES.interfaceDensity,
        sidebar_collapsed: DEFAULT_PREFERENCES.sidebarCollapsed,
        dashboard_layout: DEFAULT_PREFERENCES.dashboardLayout,
        in_app_notifications: DEFAULT_PREFERENCES.inAppNotifications,
        email_notifications: DEFAULT_PREFERENCES.emailNotifications,
        task_assignments: DEFAULT_PREFERENCES.taskAssignments,
        deadline_reminders: DEFAULT_PREFERENCES.deadlineReminders,
        task_status_updates: DEFAULT_PREFERENCES.taskStatusUpdates,
        mentions_and_comments: DEFAULT_PREFERENCES.mentionsAndComments,
        project_updates: DEFAULT_PREFERENCES.projectUpdates,
        workspace_activity: DEFAULT_PREFERENCES.workspaceActivity,
        risk_alerts: DEFAULT_PREFERENCES.riskAlerts,
        ai_recommendations_notif: DEFAULT_PREFERENCES.aiRecommendationsNotif,
        quiet_hours_enabled: DEFAULT_PREFERENCES.quietHoursEnabled,
        quiet_hours_start: DEFAULT_PREFERENCES.quietHoursStart,
        quiet_hours_end: DEFAULT_PREFERENCES.quietHoursEnd,
        dnd_enabled: DEFAULT_PREFERENCES.dndEnabled,
        notification_frequency: DEFAULT_PREFERENCES.notificationFrequency,
        default_task_view: DEFAULT_PREFERENCES.defaultTaskView,
        default_task_priority: DEFAULT_PREFERENCES.defaultTaskPriority,
        default_task_sort: DEFAULT_PREFERENCES.defaultTaskSort,
        show_completed_tasks: DEFAULT_PREFERENCES.showCompletedTasks,
        default_task_filter: DEFAULT_PREFERENCES.defaultTaskFilter,
        week_starts_on: DEFAULT_PREFERENCES.weekStartsOn,
        default_workspace_id: null,
        default_landing_page: DEFAULT_PREFERENCES.defaultLandingPage,
        remember_last_workspace: DEFAULT_PREFERENCES.rememberLastWorkspace,
        remember_last_project: DEFAULT_PREFERENCES.rememberLastProject,
        last_workspace_id: null,
        last_project_id: null,
        timezone: DEFAULT_PREFERENCES.timezone,
        date_format: DEFAULT_PREFERENCES.dateFormat,
        time_format: DEFAULT_PREFERENCES.timeFormat,
        ai_recommendations: DEFAULT_PREFERENCES.aiRecommendations,
        proactive_insights: DEFAULT_PREFERENCES.proactiveInsights,
        ai_task_suggestions: DEFAULT_PREFERENCES.aiTaskSuggestions,
        ai_generated_summaries: DEFAULT_PREFERENCES.aiGeneratedSummaries,
        quackie_suggestions: DEFAULT_PREFERENCES.quackieSuggestions,
        ai_insight_frequency: DEFAULT_PREFERENCES.aiInsightFrequency,
        profile_visibility: DEFAULT_PREFERENCES.profileVisibility,
        activity_visibility: DEFAULT_PREFERENCES.activityVisibility,
        personalized_dashboard: DEFAULT_PREFERENCES.personalizedDashboard,
        personalized_recommendations: DEFAULT_PREFERENCES.personalizedRecommendations,
        updated_at: new Date(),
    };

    const record = await prisma.user_preferences.upsert({
        where: { user_id: userId },
        update: resetData,
        create: {
            user_id: userId,
            ...resetData,
        },
    });

    const normalized = normalizeFromDb(record);

    emitRealtimeEvent({
        type: "user.preferences_updated",
        userId,
        data: normalized,
    });

    return normalized;
};
