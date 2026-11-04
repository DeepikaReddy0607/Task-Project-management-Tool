// Test date parsing and mapping across timezones
const timezones = ['Asia/Kolkata', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];

for (const tz of timezones) {
    process.env.TZ = tz;
    console.log(`\n================ Timezone: ${tz} ================`);

    // Scenario: user selects due date '2026-11-10' on date input
    const inputDateStr = '2026-11-10';

    // 1. In backend:
    // When backend does: new Date('2026-11-10')
    const backendDate = new Date(inputDateStr);
    console.log('Backend parsed (new Date("2026-11-10")):', backendDate.toISOString());

    // Express res.json serializes it:
    const jsonStr = JSON.stringify({ due_date: backendDate });
    const payload = JSON.parse(jsonStr);
    const receivedDate = payload.due_date; // string: "2026-11-10T00:00:00.000Z"
    console.log('JSON received in frontend:', receivedDate);

    // 2. Frontend normalizeEventDate:
    // Current code in Calendar.jsx:
    /*
    const normalizeEventDate = (date) => {
      if (!date) return null;
      if (typeof date === "string") {
        return date.slice(0, 10);
      }
      return toDateKey(new Date(date));
    };
    */
    const normalizedStr = typeof receivedDate === 'string' ? receivedDate.slice(0, 10) : null;
    console.log('normalizedStr (date.slice(0,10)):', normalizedStr);

    // BUT WHAT IF receivedDate is a Date object?
    // In toDateKey:
    const toDateKey = (date) => {
      if (!date) return "";
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    console.log('toDateKey(new Date(receivedDate)):', toDateKey(new Date(receivedDate)));

    // 3. What if backend sends a timestamp with time? E.g. "2026-11-10T18:30:00.000Z"?
    // In UTC, this is Nov 10. In Asia/Kolkata, this is Nov 11 (00:00 AM)!
    // In America/New_York, "2026-11-10T00:00:00.000Z" is Nov 9 (7:00 PM)!
    // If someone does new Date(receivedDate) and gets local date:
    // In America/New_York: Nov 9! (OFF BY ONE DAY!)
    // In Asia/Kolkata: Nov 10!
    
    // 4. What about Calendar cells?
    // How are calendar cells generated?
    // In Calendar.jsx:
    /*
    const firstDay = new Date(year, month, 1);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - leadingDays);
    */
    const viewDate = new Date(2026, 10, 1);
    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const leadingDays = (firstDay.getDay() + 6) % 7;
    const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - leadingDays);
    
    const cellDates = Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });

    const targetCell = cellDates.find(d => toDateKey(d) === inputDateStr);
    console.log('Target cell found for ' + inputDateStr + '?:', !!targetCell, targetCell ? toDateKey(targetCell) : 'NONE');
}
