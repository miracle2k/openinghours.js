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


import {DateTime} from 'luxon';


type WeekdayName = 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';
const DaysOfTheWeekInOrder: WeekdayName[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];


export type OpeningTimesRule = {
  dayOfWeek?: WeekdayName|WeekdayName[],
  opens: string,
  closes: string,
  validFrom?: string,
  validThrough?: string
};


export type OpeningTimes = OpeningTimesRule[];


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
 */
export function getCurrentState(rules: OpeningTimes, opts?: {
  date?: Date|DateTime,
  rulesTimezone: string
}): OpeningHoursState {
  let now: DateTime;

  // Point in time to work with.
  if (opts?.date) {
    if (opts.date instanceof Date) {
      now = DateTime.fromJSDate(opts.date);
    }
    else {
      now = opts.date;
    }
  }
  else {
    now = DateTime.local();
  }

  // Loop by specificity. This works because quite well because each level
  // of specificity, in case it applies, is quiet clear
  const sortedRules = sortBySpecificity(rules);

  let matchingRule: OpeningHoursState|null = null;

  for (const rule of sortedRules) {
    // What does this rule tell us about whether we are open, when we close or when we might be opening next?
    matchingRule = testRuleForOpenNow(rule, now, {rulesTimezone: opts?.rulesTimezone});
    if (!matchingRule) {
      continue;
    }
    break;
  }

  // No rule  matched, so we are closed
  if (!matchingRule) {
    matchingRule = {
      isOpen: false
    };
  }

  // In some/many cases, this single rule can tell us not just if we are open or closed, but also when
  // we will close or open (if the rule matched and has a open/close time upcoming, we do not allow this
  // to be overridden).
  if (matchingRule.isOpen && matchingRule.closesAt) {
    return matchingRule;
  }
  if (!matchingRule.isOpen && matchingRule.opensAt) {
    return matchingRule;
  }

  // OK, so we know if we are closed or open, but when is the next state change?
  const nextChange = getNextStateChange({
    sortedRules,
    startAt: now,
    lookingFor: matchingRule.isOpen ? 'close' : 'open',
    rulesTimezone: opts?.rulesTimezone
  });
  if (nextChange) {
    if (matchingRule.isOpen) {
      matchingRule.closesAt = nextChange.toJSDate();
    } else {
      matchingRule.opensAt = nextChange.toJSDate();
    }
  }
  return matchingRule;
}


/**
 * Loops from `startAt` to find the next close or open time.
 */
function getNextStateChange(opts: {
  sortedRules: OpeningTimes,
  startAt: DateTime,
  lookingFor: 'open'|'close',
  rulesTimezone?: string
}): DateTime|null {
  const {lookingFor, rulesTimezone} = opts;

  let current = opts.startAt;
  while (true) {
    const rule = findMatchingRule({sortedRules: opts.sortedRules, date: current});

    let closedWholeDay: boolean;
    let openWholeDay: boolean;
    let opens: DateTime|null;
    let closes: DateTime;
    if (rule) {
      closedWholeDay = (rule.opens === '00:00' && rule.closes === '00:00');
      openWholeDay = (rule.opens === '00:00' && rule.closes === '23:59');

      opens = timeToDate(rule.opens, {onDay: current, stringTimezone: rulesTimezone});
      closes = timeToDate(rule.closes, {onDay: current, stringTimezone: rulesTimezone});
    }

    // No rule found means closed the whole day.
    else {
      closedWholeDay = false;
      openWholeDay = false;
      opens = null;
      closes = timeToDate('00:00', {onDay: current, stringTimezone: rulesTimezone});
    }

    const isFirstDayOfSearch = current === opts.startAt;

    if (lookingFor == 'open') {
      // If the rule marks as "closed the whole day", then we cannot find the desired open time here.
      if (openWholeDay) {
        return opens;
      }
      if (!closedWholeDay && opens) {
        if (isFirstDayOfSearch) {
          // Only accept a rule opening time or closing time as "next" if it is after the search time.
          if (current <= opens) {
            return opens;
          }
        }
        else {
          return opens;
        }
      }
    }
    if (lookingFor == 'close') {
      // If the rule marks as "open the whole day", then we cannot find the desired close time here.
      if (!openWholeDay) {
        if (isFirstDayOfSearch) {
          // Only accept a rule opening time or closing time as "next" if it is after the search time.
          if (current <= closes) {
            return closes;
          }
        }
        else {
          return closes;
        }
      }
    }

    current = current.plus({days: 1}).set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0
    });
  }
}


function findMatchingRule(opts: {
  sortedRules: OpeningTimesRule[],
  date: DateTime
}): OpeningTimesRule|null {

  
  

  const dayRules = opts.sortedRules
    //  Return the rules for a given day
    .filter(rule => ruleAppliesToDay(rule, opts.date))
    //  Return the correct period, if multiple opening hours in a day
    .filter(rule => {

      const now = opts.date;
      const opens = timeToDate(rule.opens, { onDay: opts.date })
      const closes = timeToDate(rule.closes, { onDay: opts.date })

      // console.log(now.toString());
      // console.log(opens.toString());
      // console.log(closes.toString());
      // console.log(((opts.date <= closes) || (opts.date <= opens) ));
      
      // console.log("------- R U L E --------");
      
      // console.log(JSON.stringify(rule,null, 4));

      
      if (((opts.date <= closes) || (opts.date <= opens) )) {
        return rule;
      
      }

    })

    // console.log(JSON.stringify(dayRules[0],null, 4));
    
 
return dayRules[0] || null;



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
function testRuleForOpenNow(rule: OpeningTimesRule, date: DateTime, opts: {rulesTimezone?: string}): OpeningHoursState|null {
  if (!ruleAppliesToDay(rule, date)) {
    return null;
  }

  const opens = timeToDate(rule.opens, {onDay: date, stringTimezone: opts.rulesTimezone});
  const closes = timeToDate(rule.closes, {onDay: date, stringTimezone: opts.rulesTimezone});
  const isOpen = date > opens && date < closes;
  return {isOpen};
}


/**
 * Test if the rule applies to the day in `Date`, by checking `dayOfWeek` and `validFrom` and `validThrough`.
 */
function ruleAppliesToDay(rule: OpeningTimesRule, day: DateTime): boolean {
  const currentDayOfWeek = getDayOfWeek(day);

  // See if this rule matches.
  if (rule.dayOfWeek) {
    if (rule.dayOfWeek.indexOf(currentDayOfWeek) == -1) {
      return false;
    }
  }

  if (rule.validFrom) {
    if (day < DateTime.fromISO(rule.validFrom)) {
      return false;
    }
  }
  if (rule.validThrough) {
    if (day > DateTime.fromISO(rule.validThrough)) {
      return false;
    }
  }

  return true;
}


/**
 * Convert a `time` string such as `04:33` to a full `Date` instance, using `date` as the base (the date will
 * provide the day/month/year).
 */
export function timeToDate(time: string, opts: {
  onDay: DateTime,
  stringTimezone?: string
}): DateTime {
  let result = DateTime.fromFormat(time, 'HH:mm', {zone: opts.stringTimezone});
  return result.set({
    day: opts.onDay.day,
    month: opts.onDay.month,
    year: opts.onDay.year,
    second: 0,
    millisecond: 0
  });
}


function sortBySpecificity(rules: OpeningTimes): OpeningTimes {
  rules = [...rules];
  rules.sort((a, b) => {
    // First, the date range restrictions
    const aDates = [a.validThrough, a.validFrom].filter(x => !!x).length;
    const bDates = [b.validThrough, b.validFrom].filter(x => !!x).length;
    if (aDates !== bDates) {
      return bDates - aDates;
    }

    // Second, if "dayOfWeek" is set.
    const aHasWeek = a.dayOfWeek !== undefined ? 1 : 0;
    const bHasWeek = b.dayOfWeek !== undefined ? 1 : 0;
    return bHasWeek - aHasWeek;
  });
  return rules;
}


/**
 * Return the day of the week which covers the moment in time given by `time`,
 */
function getDayOfWeek(time: DateTime): WeekdayName {
  return DaysOfTheWeekInOrder[time.weekday-1];
}
