import { auth } from "@/lib/auth/auth";
import { getCalendarItems } from "@/lib/calendar/items";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarNav } from "@/components/calendar/calendar-nav";
import { DayView } from "@/components/calendar/day-view";
import { WeekView } from "@/components/calendar/week-view";
import { MonthView } from "@/components/calendar/month-view";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { view: viewParam, date: dateParam } = await searchParams;
  const view = (viewParam === "day" || viewParam === "month" ? viewParam : "week") as "day" | "week" | "month";
  const date = dateParam ? new Date(dateParam) : new Date();

  const session = await auth();
  const userId = session!.user.id;

  let rangeStart: Date, rangeEnd: Date, label: string, prevDate: Date, nextDate: Date;

  if (view === "day") {
    rangeStart = date;
    rangeEnd = addDays(date, 1);
    label = format(date, "EEEE, MMM d");
    prevDate = addDays(date, -1);
    nextDate = addDays(date, 1);
  } else if (view === "month") {
    rangeStart = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
    rangeEnd = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
    label = format(date, "MMMM yyyy");
    prevDate = addMonths(date, -1);
    nextDate = addMonths(date, 1);
  } else {
    rangeStart = startOfWeek(date, { weekStartsOn: 1 });
    rangeEnd = endOfWeek(date, { weekStartsOn: 1 });
    label = `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d")}`;
    prevDate = addWeeks(date, -1);
    nextDate = addWeeks(date, 1);
  }

  const items = await getCalendarItems(userId, rangeStart, rangeEnd);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <p className="mt-1 text-muted">Everything — school, study, gym, football, exams, tasks and recovery — in one view.</p>

      <Card className="mt-6">
        <CardContent className="flex flex-col gap-4">
          <CalendarNav
            view={view}
            date={format(date, "yyyy-MM-dd")}
            label={label}
            prevHref={`/calendar?view=${view}&date=${format(prevDate, "yyyy-MM-dd")}`}
            nextHref={`/calendar?view=${view}&date=${format(nextDate, "yyyy-MM-dd")}`}
          />

          {view === "day" && <DayView items={items} />}
          {view === "week" && <WeekView days={days} items={items} />}
          {view === "month" && <MonthView days={days} month={date} items={items} />}
        </CardContent>
      </Card>
    </div>
  );
}
