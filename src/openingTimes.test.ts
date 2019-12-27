import {getCurrentState, OpeningTimes, timeToDate} from './openingTimes'
import {DateTime} from "luxon";


const basicRules: OpeningTimes = [
  {
    dayOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    opens: '08:00',
    closes: '18:00'
  },
  {
    dayOfWeek: ['saturday'],
    opens: '08:00',
    closes: '16:00'
  },
  {
    dayOfWeek: ['sunday'],
    opens: '10:00',
    closes: '12:00'
  }
];

describe("timeToDate", () => {

  it("timezone of passed in  base date is considered when determining the day", () => {
    // TODO: If this test is not run in the GMT timezone, it may not serve its purpose and pass regardless.
    const result = timeToDate("06:00", {
      onDay: DateTime.fromISO('2019-12-04T21:46:20', {zone: 'America/New_York'}),
    });

    // This is on the 4th, not the 5th, which would be the GMT date of that moment.
    expect(result.toJSDate()).toEqual(new Date("2019-12-04T06:00:00.000Z"))
  });

  it("string timezone is respected", () => {
    const result = timeToDate("06:00", {
      onDay: DateTime.fromISO('2019-12-04T21:46:20', {zone: 'America/New_York'}),
      stringTimezone: 'America/New_York'
    });

    // 06:00 America/New_York is 11:00 am in UTC
    expect(result.toJSDate()).toEqual(new Date("2019-12-04T11:00:00.000Z"));
    expect(result.zoneName).toEqual('America/New_York');
  });
});

test('already closed today, opens tomorrow', () => {
  const result = getCurrentState(basicRules, {date: DateTime.fromISO('2019-12-04T19:00:00'), rulesTimezone: 'GMT'});
  expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-05T08:00:00.000Z")});
});

test('still open today', () => {
  const result = getCurrentState(basicRules, {
    date: new Date(2019, 11, 4, 15, 0, 0),
    rulesTimezone: 'GMT'});
  expect(result).toEqual({"isOpen": true, "closesAt": new Date("2019-12-04T18:00:00.000Z")});
});

test('not yet open today', () => {
  const result = getCurrentState(basicRules, {
    date: new Date(2019, 11, 4, 4, 0, 0),
    rulesTimezone: 'GMT'});
  expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-04T08:00:00.000Z")});
});

test('tomorrow does not open due to date-specific rules', () => {
  const result = getCurrentState([
    ...basicRules,
    {
       "opens": "00:00",
       "closes": "00:00",
       validFrom: '2019-11-5',
       validThrough: '2019-12-10',
    }
  ], {date: new Date(2019, 11, 4, 19, 0, 0)});

  expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-11T08:00:00.000Z")});
});
