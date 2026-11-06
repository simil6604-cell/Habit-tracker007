import { isAfter, isSameDay, startOfDay } from "date-fns";
import {
  KIND_META,
  dayKey,
  monthGrid,
  monthWeeks,
  planState,
  type PlanCheckRow,
  type PlanDomain,
  type PlanItem,
  type PlanKind,
} from "./plan";

/**
 * The month as a tracker: one row per thing you do, one column per day, and
 * what happened in each square.
 *
 * Asked for with photographs of a spreadsheet — a grid of ticks, a ring with
 * a percentage, a bar per week, a table of which habits are holding up. This
 * builds those numbers out of what the app already knows: every piece of
 * homework, every workout, every training and match, and the record of what
 * was ticked off.
 *
 * All pure. The page fetches and draws; what a square means and what counts
 * towards a percentage is decided here, where it can be tested.
 */

/**
 * NONE is not a gap in the data — it means nothing was planned that day, and
 * it has to be told apart from "planned and not done" or every rest day
 * would read as a failure.
 */
export type TrackState = "DONE" | "MISSED" | "OPEN" | "FUTURE" | "NONE";

export type TrackCell = { date: Date; state: TrackState };

export type Track = {
  sourceKey: string;
  kind: PlanKind;
  domain: PlanDomain;
  title: string;
  /** The subject, the focus — what this is about in one word. */
  context: string | null;
  cells: TrackCell[];
  /** Days it was planned for and that have already happened. */
  due: number;
  done: number;
  missed: number;
  /** Still open, and the day has passed. */
  slipped: number;
  /** Planned for a day still to come. */
  upcoming: number;
  /** done ÷ due, as a whole number. Null when nothing is due yet. */
  pct: number | null;
  /** Ticks in a row, counting back from the last day that has happened. */
  streak: number;
  longestStreak: number;
};

export type WeekBar = {
  label: string;
  from: Date;
  to: Date;
  due: number;
  done: number;
  pct: number | null;
};

export type DomainRoll = {
  domain: PlanDomain;
  due: number;
  done: number;
  missed: number;
  pct: number | null;
};

export type TrackerData = {
  days: Date[];
  tracks: Track[];
  weeks: WeekBar[];
  domains: DomainRoll[];
  due: number;
  done: number;
  missed: number;
  upcoming: number;
  pct: number | null;
};

/** The order the three always appear in, so a colour never moves. */
export const DOMAIN_ORDER: PlanDomain[] = ["SCHOOL", "GYM", "FOOTBALL", "GENERAL"];

function percent(done: number, due: number): number | null {
  // Null rather than 0: a month that has not started is not a month you have
  // failed, and "0%" on an empty week is the single most dishonest number a
  // tracker like this can show.
  return due === 0 ? null : Math.round((done / due) * 100);
}

/**
 * Every day of the month the table covers, Monday-aligned whole weeks — the
 * same days the month view uses, so a square here and a cell there are the
 * same day.
 */
export function trackerDays(month: Date): Date[] {
  return monthGrid(month);
}

/**
 * Builds the whole dashboard.
 *
 * `today` is passed in rather than read from the clock so the tests can place
 * it where they need it — half the behaviour here is about which side of
 * today a day falls on.
 */
export function buildTracker(
  items: PlanItem[],
  checks: Map<string, PlanCheckRow>,
  month: Date,
  today: Date
): TrackerData {
  const days = trackerDays(month);
  const todayStart = startOfDay(today);

  // One row per thing, keyed by what it is rather than by what day it fell
  // on: a workout every Tuesday is one row with four squares filled in, not
  // four rows.
  const rows = new Map<string, { item: PlanItem; byDay: Map<string, PlanItem> }>();
  for (const item of items) {
    const row = rows.get(item.sourceKey);
    if (row) row.byDay.set(dayKey(item.date), item);
    else rows.set(item.sourceKey, { item, byDay: new Map([[dayKey(item.date), item]]) });
  }

  const tracks: Track[] = [];
  for (const [sourceKey, row] of rows) {
    const cells: TrackCell[] = [];
    let done = 0;
    let missed = 0;
    let slipped = 0;
    let upcoming = 0;
    let streak = 0;
    let longestStreak = 0;
    let running = 0;

    for (const day of days) {
      const planned = row.byDay.get(dayKey(day));
      if (!planned) {
        cells.push({ date: day, state: "NONE" });
        continue;
      }
      const state = planState(planned, checks).status;
      // The state is read before the date is, so homework finished on
      // Sunday for Thursday still shows its tick. Only something nobody has
      // said anything about yet is "still to come" — checking the date
      // first threw the tick away and told you the work was not done.
      if (state !== "DONE" && state !== "MISSED" && isAfter(startOfDay(day), todayStart)) {
        upcoming++;
        cells.push({ date: day, state: "FUTURE" });
        continue;
      }
      if (state === "DONE") {
        done++;
        running++;
        longestStreak = Math.max(longestStreak, running);
        cells.push({ date: day, state: "DONE" });
      } else if (state === "MISSED") {
        missed++;
        running = 0;
        cells.push({ date: day, state: "MISSED" });
      } else {
        // Open and the day has gone. Today itself is not counted against you
        // until it is over, so it stays open without breaking the run.
        if (!isSameDay(day, todayStart)) {
          slipped++;
          running = 0;
        }
        cells.push({ date: day, state: "OPEN" });
      }
      streak = running;
    }

    const due = done + missed + slipped;
    tracks.push({
      sourceKey,
      kind: row.item.kind,
      domain: KIND_META[row.item.kind].domain,
      title: row.item.title,
      context: row.item.context,
      cells,
      due,
      done,
      missed,
      slipped,
      upcoming,
      pct: percent(done, due),
      streak,
      longestStreak,
    });
  }

  // Grouped by domain in a fixed order, then by how well it is going, then by
  // name. A list that reorders itself as the numbers move is one you cannot
  // find anything in twice.
  tracks.sort((a, b) => {
    const byDomain = DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain);
    if (byDomain !== 0) return byDomain;
    const byPct = (b.pct ?? -1) - (a.pct ?? -1);
    if (byPct !== 0) return byPct;
    return a.title.localeCompare(b.title, "de");
  });

  const weeks: WeekBar[] = monthWeeks(month).map((week, index) => {
    let weekDue = 0;
    let weekDone = 0;
    for (const track of tracks) {
      for (const cell of track.cells) {
        if (!week.some((day) => isSameDay(day, cell.date))) continue;
        if (cell.state === "DONE") {
          weekDone++;
          weekDue++;
        } else if (cell.state === "MISSED" || (cell.state === "OPEN" && !isSameDay(cell.date, todayStart))) {
          weekDue++;
        }
      }
    }
    return {
      label: `Week ${index + 1}`,
      from: week[0],
      to: week[6],
      due: weekDue,
      done: weekDone,
      pct: percent(weekDone, weekDue),
    };
  });

  const domains: DomainRoll[] = DOMAIN_ORDER.map((domain) => {
    const mine = tracks.filter((track) => track.domain === domain);
    const due = mine.reduce((sum, track) => sum + track.due, 0);
    const done = mine.reduce((sum, track) => sum + track.done, 0);
    const missed = mine.reduce((sum, track) => sum + track.missed, 0);
    return { domain, due, done, missed, pct: percent(done, due) };
  }).filter((roll) => roll.due > 0 || roll.done > 0);

  const due = tracks.reduce((sum, track) => sum + track.due, 0);
  const done = tracks.reduce((sum, track) => sum + track.done, 0);
  const missed = tracks.reduce((sum, track) => sum + track.missed, 0);
  const upcoming = tracks.reduce((sum, track) => sum + track.upcoming, 0);

  return { days, tracks, weeks, domains, due, done, missed, upcoming, pct: percent(done, due) };
}

/** The rows worth putting at the top: the ones with the most behind them. */
export function topTracks(tracks: Track[], limit = 10): Track[] {
  return [...tracks]
    .filter((track) => track.due > 0)
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.due - a.due || a.title.localeCompare(b.title, "de"))
    .slice(0, limit);
}
