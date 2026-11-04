import { getCalendarEvents } from "../services/calendarService.js";

export const getCalendar = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const startDate = req.query.startDate || req.query.start;
        const endDate = req.query.endDate || req.query.end;

        const events = await getCalendarEvents(userId, { startDate, endDate });

        return res.status(200).json({
            success: true,
            events,
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        console.error("Calendar error:", error);
        next(error);
    }
};