import { getCalendarEvents } from "../services/calendarService.js";

export const getCalendar = async (req, res) => {
    try {
        const userId = req.user.userId;

        const events = await getCalendarEvents(userId);

        return res.status(200).json({
            success: true,
            events,
        });
    } catch (error) {
        console.error("Calendar error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load calendar events.",
        });
    }
};