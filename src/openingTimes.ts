/**
 * Can format a string such as "Closed. Opens Monday, 8:00".
 *
 * At first, I tried to have a very smart algorithm which iterates over the list of rules once and finds all
 * the information needed. But I couldn't do it. Consider the following case:
 *
 *    It is 22th of December, a Sunday.
 *    Rule 1: Tuesday, open from 08:00 to 15:00.
 *    Rule 2: 24th of December, a Tuesday, closed.
 *
 * Here, we have to recognize that the second rule modifies the effect of the first. The answer to the question,
 * "when do we open?", is "according to rule 1 and rule 2 combined, on the tuesday one week later".
 *
 * Instead of being smart, we take the easier route of having a logic for "find the rule which applies to a given
 * day", and then "iterate day for day until we find one where the rules tell us it is open".
 *
 * How about this for a test:
 *
 *    Rule 1: Tuesday, open from 08:00 to 15:00.
 *    Rule 2: 20th October, a Tuesday, open from 18:00 to 20:00.
 *
 * What does it mean? In all likelihood, that on the 20h of October, we only open at 6, and rule 1 is fully replaced.
 *
 * How about this:
 *
 *     Rule 1: Any day, 08:00 to 18:00
 *     Rule 2: Through January, on Tuesday, 10:00 to 18:00
 *
 * What does this mean? During January, are we ONLY open on Tuesday, or do merely modify the regular dates?
 * I think the latter; otherwise, multiple "through January" rules would need to be taken together.
 *
 * How about this:
 *
 *     Rule 1: Any day, 08:00 to 18:00
 *     Rule 2: Through January, on Tuesday, 10:00 to 18:00
 *     Rule 3: January the 5th, closed.
 *
 * Presumably, on January the 5th, Rule 3 overrides Rule 2. It seems more specific.
 *
 * How about this;
 *
 *    Rule 1: Any day, 08:00 to 12:00
 *    Rule 2: Any day, 14:00 to 18:00
 *
 * What if the rules are reversed? Are we smart enough to look at both of them / the right one, to find the
 * "next" opening time?
 */

import { getDay, isAfter, isBefore, parse, addDays, set } from 'date-fns'
import {toDate, zonedTimeToUtc} from "date-fns-tz";


type WeekdayName = 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';
const DaysOfTheWeekInOrder: WeekdayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];


export type OpeningTimesRule = {
  dayOfWeek?: WeekdayName|WeekdayName[],
  opens: string,
  closes: string
};


export type OpeningTimes = OpeningTimesRule[];


type OpeningHoursState = {
  isOpen: true,
  closesAt?: Date
}|{
  isOpen: false,
  opensAt?: Date
}


/**
 * Return if the place is open or closed, and when it opens or closes.
 *
 * Timezone rules:
 *
 * - If `date` is a `Date` instance, it is used as-is.
 * - If it is a string with a timezone component, it is parsed correctly.
 * - If it is a string without a timezone component, `opts.timezone` is used.
 * - If there is no `opts.timezone`, then the local timezone is used.
 */
export function getCurrentState(rules: OpeningTimes, opts?: {
  date: Date|string,
  timezone?: string
}): OpeningHoursState {
  let now;
  if (opts && opts.date) {
    now = toDate(opts.date, {timeZone: opts.timezone});
  } else {
    now = new Date();
  }

  // Loop by specificity. This works because quite well because each level
  // of specificity, in case it applies, is quiet clear
  const sortedRules = sortBySpecificity(rules);

  for (const rule of sortedRules) {
    // What does this rule tell us about whether we are open, when we close
    // or when we might be opening next?

    const result = testRuleForOpenNow(rule, now, {timezone: opts.timezone});
    if (!result) {
      continue;
    }

    // In some/many cases, this single rule can tell us not just if we are open or closed, but also when
    // we will close or open (if the rule matched and has a open/close time upcoming, we do not allow this
    // to be overridden).
    if (result.isOpen && result.closesAt) {
      return result;
    }
    if (result.isOpen === false && result.opensAt) {
      return result;
    }

    // OK, so we know if we are closed or open, but when is the next state change?
    const nextChange = getNextStateChange({
      rules,
      startAt: now,
      lookingFor: result.isOpen ? 'close' : 'open',
      timezone: opts.timezone
    });
    if (result.isOpen === true) {
      result.closesAt = nextChange;
    }
    else {
      result.opensAt = nextChange;
    }
    return result;
  }

  // No rule  matched, so we are closed
  return null;
  // TODO: find the next opening time.
  // TODO: what if there are none, how can we ignore a loop?
}


function getNextStateChange(opts: {
  rules: OpeningTimes,
  startAt: Date,
  lookingFor: 'open'|'close',
  timezone: string
}): Date|null {
  const {lookingFor, timezone} = opts;
  const sortedRules = sortBySpecificity(opts.rules);

  let current = opts.startAt;
  while (true) {

    for (const rule of sortedRules) {
      if (!ruleAppliesToDay(rule, current)) {
        continue;
      }

      const opens = timeToDate(rule.opens, {date: current, timezone});
      const closes = timeToDate(rule.closes, {date: current, timezone});

      // If we are still on the first day, we need to make sure we also
      // test the time.
      if (current === opts.startAt) {
        if (lookingFor == 'open') {
          if (isAfter(current, opens)) {
            continue;
          }
        }
        if (lookingFor == 'close') {
          if (isAfter(current, closes)) {
            continue;
          }
        }
      }

      if (lookingFor == 'open') {
        return opens;
      }
      if (lookingFor == 'close') {
        return closes;
      }
    }

    current = set(addDays(current, 1), {
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });
  }
}


/**
 * Return true if this rule tells us we are open right now. Possible return
 * values are:
 *
 * - null (if the rule does not apply at all).
 * - that the rule applies, and indicates we are closed.
 * - that the rule applies, and indicates we are open.
 *
 * Also, if this rule includes a closing time, that's it. But it might not,
 * indicating "all hours".
 */
function testRuleForOpenNow(rule: OpeningTimesRule, date: Date, opts: {timezone: string}): OpeningHoursState|null {
  if (!ruleAppliesToDay(rule, date)) {
    return null;
  }

  const opens = timeToDate(rule.opens, {date, timezone: opts.timezone});
  const closes = timeToDate(rule.closes, {date, timezone: opts.timezone});
  const isOpen = isAfter(date, opens) && isBefore(date, closes);
  return {isOpen};
}


function ruleAppliesToDay(rule: OpeningTimesRule, day: Date): boolean {
  const currentDayOfWeek = getDayOfWeek(day);

  // See if this rule matches.
  if (rule.dayOfWeek) {
    if (rule.dayOfWeek.indexOf(currentDayOfWeek) == -1) {
      return false;
    }
  }

  return true;
}


/**
 * Convert a `time` string such as `04:33` to a full `Date` instance, using
 * `date` as the base (it will provide the day/month/year).
 *
 * Because JavaScript date objects are always in the local timezone, any such
 * time would therefore also be situated in the local timezone.
 *
 * For this reason, we also require the caller to provide the timezone in
 * which time time in `time` is supposed to be set.
 */
function timeToDate(time: string, opts: {
  date: Date,
  timezone: string
}): Date {
  let result = parse(time, 'HH:mm', opts.date);
  result = zonedTimeToUtc(result, opts.timezone);
  return result;
}


function sortBySpecificity(x: any) {
  // For now, assume is sorted correctly.
  return x;
}


function getNextDayOfWeek(weekDay: WeekdayName): WeekdayName {
  const idx = DaysOfTheWeekInOrder.indexOf(weekDay);
  const newIdx = idx < DaysOfTheWeekInOrder.length - 1 ? idx + 1 : 0;
  return DaysOfTheWeekInOrder[newIdx];
}

function getDayOfWeek(time: Date): WeekdayName {
  const day = getDay(time);
  return DaysOfTheWeekInOrder[day];
}