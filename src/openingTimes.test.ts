import {getCurrentState, OpeningTimes, timeToDate} from './openingTimes'
import {DateTime} from "luxon";


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


describe("getCurrentState", () => {

  describe("single rule, open/close time logic", () => {

    const singleRule: OpeningTimes = [
      {
        opens: '08:00',
        closes: '18:00'
      }
    ];

    test('already closed today, opens tomorrow', () => {
      const result = getCurrentState(singleRule, {date: DateTime.fromISO('2019-12-04T19:00:00'), rulesTimezone: 'GMT'});
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-05T08:00:00.000Z")});
    });

    test('still open today', () => {
      const result = getCurrentState(singleRule, {
        date: DateTime.fromJSDate(new Date(2019, 11, 4, 15, 0, 0), {zone: 'GMT'}),
        rulesTimezone: 'GMT'});
      expect(result).toEqual({"isOpen": true, "closesAt": new Date("2019-12-04T18:00:00.000Z")});
    });

    test('not yet open today', () => {
      const result = getCurrentState(singleRule, {
        date: DateTime.fromJSDate(new Date(2019, 11, 4, 4, 0, 0), {zone: 'GMT'}),
        rulesTimezone: 'GMT'});
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-04T08:00:00.000Z")});
    });

    test('closed today overrides base rule for all days', () => {
      const result = getCurrentState([
          ...singleRule,
          {
            dayOfWeek: 'friday',
            opens: '00:00',
            closes: '00:00'
          }
        ], {
          // Should be open based in `singleRule`, but friday-closed takes over
          date: DateTime.fromJSDate(new Date(2019, 11, 27, 14, 0, 0), {zone: 'GMT'}),
          rulesTimezone: 'GMT'
        });
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-28T08:00:00.000Z")});
    });

    test('closed tomorrow overrides base rule for all days', () => {
      const result = getCurrentState([
        ...singleRule,
        {
          dayOfWeek: 'friday',
          opens: '00:00',
          closes: '00:00'
        }
      ], {
        // Based on `singleRule`, should be open tomorrow, but friday-closed says otherwise.
        date: DateTime.fromJSDate(new Date(2019, 11, 27, 21, 0, 0), {zone: 'GMT'}),
        rulesTimezone: 'GMT'
      });
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-28T08:00:00.000Z")});
    });

  });

  describe("dayOfWeek option", () => {

    test('sunday rule overrides generic one', () => {
      const result = getCurrentState([
        {
          opens: '09:00',
          closes: '18:00',
        },
        {
          opens: '10:00',
          closes: '17:00',
          dayOfWeek: ['sunday'],
        },
      ], {date: DateTime.fromISO('2020-02-16T09:30:00.000+02:00'), rulesTimezone: 'Europe/Kiev'});
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2020-02-16T08:00:00.000Z")});
    });

    test('tomorrow closed due to not included in dayOfWeek', () => {
      const result = getCurrentState([
        {
          dayOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          opens: '08:00',
          closes: '18:00'
        },
      ], {date: DateTime.fromISO('2019-12-27T19:00:00Z'), rulesTimezone: 'GMT'});
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-30T08:00:00.000Z")});
    });

    test('tomorrow closed due to set to closed in a separate rule', () => {
      const result = getCurrentState([
        {
          dayOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          opens: '08:00',
          closes: '18:00'
        },
        {
          dayOfWeek: ['saturday', 'sunday'],
          opens: '00:00',
          closes: '00:00'
        },
      ], {date: DateTime.fromISO('2019-12-04T19:00:00Z'), rulesTimezone: 'GMT'});
      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-05T08:00:00.000Z")});
    });
  });


  describe("validFrom/validThrough option", () => {

    const basicRules = [
      {
        opens: '08:00',
        closes: '18:00'
      },
    ];

    test('tomorrow opening times are different due to date-specific rules', () => {
      const result = getCurrentState([
        ...basicRules,
        {
          "opens": "14:00",
          "closes": "15:00",
          validFrom: '2019-11-05',
          validThrough: '2019-12-10',
        }
      ], {
        date: new Date(2019, 11, 4, 19, 0, 0),
        rulesTimezone: 'local',
      });

      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-05T14:00:00.000Z")});
    });

    test('tomorrow does not open due to date-specific rules', () => {
      const result = getCurrentState([
        ...basicRules,
        {
          "opens": "00:00",
          "closes": "00:00",
          validFrom: '2019-11-05',
          validThrough: '2019-12-10',
        }
      ], {
        date: new Date(2019, 11, 4, 19, 0, 0),
        rulesTimezone: 'local',
      });

      expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-11T08:00:00.000Z")});
    });

  });

  describe('rulesTimezone',() => {
    test("test", () => {
      const result = getCurrentState(
          [
            {
              opens: '08:00',
              closes: '18:00'
            }
          ],
          {
            date: new Date("2019-12-05T07:30:00"),
            rulesTimezone: 'Europe/Berlin'
          }
      );

      expect(result).toEqual({"isOpen": true, "closesAt": new Date("2019-12-05T17:00:00.000Z")});
    })
  });
});