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

/**
 * A note on dates, timezones and date-fns.
 *
 * - Javascript `Date` objects cannot carry a timezone. They are always set in the host machine time zone.
 * - Because we now the host machine timezone, we know the moment in time a `Date` points to, and so, we
 *   can *calculate* what the time would be any other timezone.
 * - We can also do the reverse: If we want to represent a certain moment time in a certain timezone A as
 *   a `Date` object, we can calculate the time in the local timezone that represents that desired moment
 *   in time.
 * - `date-fns-tz` can do those calculations.
 * - The pertinent point however is that the name of the source timezone A has been lost.
 * - This is important if we want to know what day of the week was intended, which is relevant for us
 *   when evaluating our rules.
 *
 * As a result, we must carry both the `date` instance and the `timezone` is refers to, and make sure that
 * we consider the timezone when calling helpers from `date-fns`. Other libraries such as `luxon` solve this
 * by providing a better date object which can hold a timezone, but we want to stick with `date-fns` for now,
 * believing it will result in a smaller bundle size. But make no mistake, we are paying for those bytes
 * dearly with a considerable amount of complexity.
 */

import { getDay, isAfter, isBefore, parse, addDays, set } from 'date-fns'
import {toDate, utcToZonedTime, zonedTimeToUtc} from "date-fns-tz";


type WeekdayName = 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';
const DaysOfTheWeekInOrder: WeekdayName[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];


export type OpeningTimesRule = {
  dayOfWeek?: WeekdayName|WeekdayName[],
  opens: string,
  closes: string,
  validFrom?: string,
  validThrough?: string
};


export type OpeningTimes = OpeningTimesRule[];


/**
 * See "A note on dates, timezones and date-fns".
 */
export interface DateWithTZ {
  date: Date,
  timezone?: string
}


/**
 * Describe a view on the opening hours from a particular point in time.
 *
 * We are either open or closed in that moment, and have either an opening
 * or a closing time coming up.
 */
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
 *    - if opts.timezone is passed
 *    - if not passed
 * - If it is a string without a timezone component, `opts.timezone` is used,
 *    or the local timezone.
 * - If it is a string with a timezone component, it is parsed correctly.
 *
 * Internally, a `Date` instance is considered to really be in UTC, though
 * a JavaScript `Date` is always set in the machine timezone. date-fns-tz works
 * such that it finds the UTC moment in time you desire and puts it in a Date
 * object that points to the same moment in the machine timezone. As a result,
 * when it comes to "which weekday", the UTC day is what is meaningful.
 */
export function getCurrentState(rules: OpeningTimes, opts?: {
  date: Date|string,
  timezone?: string
}): OpeningHoursState {
  let now;
  if (opts && opts.date) {
    now = {
      date: toDate(opts.date, {timeZone: opts.timezone}),
      timezone: opts.timezone
    };
  } else {
    now = {
      date: new Date(),
    };
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
  startAt: DateWithTZ,
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

      const opens = timeToDate(rule.opens, {onDay: current, timezone});
      const closes = timeToDate(rule.closes, {onDay: current, timezone});

      // If we are still on the first day, we need to make sure we also
      // test the time.
      if (current === opts.startAt) {
        if (lookingFor == 'open') {
          if (isAfter(current.date, opens)) {
            continue;
          }
        }
        if (lookingFor == 'close') {
          if (isAfter(current.date, closes)) {
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

    let currentDate = set(addDays(current.date, 1), {
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0
    });
    current = {
      ...current,
      date: currentDate
    }
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
function testRuleForOpenNow(rule: OpeningTimesRule, date: DateWithTZ, opts: {timezone: string}): OpeningHoursState|null {
  if (!ruleAppliesToDay(rule, date)) {
    return null;
  }

  const opens = timeToDate(rule.opens, {onDay: date, timezone: opts.timezone});
  const closes = timeToDate(rule.closes, {onDay: date, timezone: opts.timezone});
  const isOpen = isAfter(date.date, opens) && isBefore(date.date, closes);
  return {isOpen};
}


/**
 * Test if the rule applies to the day in `Date`, by checking `dayOfWeek`
 * and `validFrom` and `validThrough`. Times (and timezones) are irrelevant
 * here, we only look at the full day.
 */
function ruleAppliesToDay(rule: OpeningTimesRule, day: DateWithTZ): boolean {
  const currentDayOfWeek = getDayOfWeek(day);

  // See if this rule matches.
  if (rule.dayOfWeek) {
    if (rule.dayOfWeek.indexOf(currentDayOfWeek) == -1) {
      return false;
    }
  }

  // Do not do more than X
  if (rule.validFrom) {

  }

  return true;
}


/**
 * Convert a `time` string such as `04:33` to a full `Date` instance, using `date` as the base (the date will
 * provide the day/month/year).
 */
export function timeToDate(time: string, opts: {
  onDay: DateWithTZ,
  timezone?: string
}): Date {
  let result = parse(time, 'HH:mm', utcToZonedTime(opts.onDay.date, opts.onDay.timezone));
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

/**
 * Return the day of the week which covers the moment in time given by
 * `time`, in the timezone given by `time`.
 */
function getDayOfWeek(time: DateWithTZ): WeekdayName {
  const day = getDay(time.date);
  return DaysOfTheWeekInOrder[day];
}
