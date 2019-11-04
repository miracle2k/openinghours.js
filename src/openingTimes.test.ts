import { getCurrentState, OpeningTimes } from './openingTimes'


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
]


test('already closed today, opens tomorrow', () => {
  const result = getCurrentState(basicRules, {date: new Date(2019, 11, 4, 19, 0, 0)});
  expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-05T08:00:00.000Z")});
});

test('still open today', () => {
  const result = getCurrentState(basicRules, {date: new Date(2019, 11, 4, 15, 0, 0)});
  expect(result).toEqual({"isOpen": true, "closesAt": new Date("2019-12-04T18:00:00.000Z")});
});

test('not yet open today', () => {
  const result = getCurrentState(basicRules, {date: new Date(2019, 11, 4, 4, 0, 0)});
  expect(result).toEqual({"isOpen": false, "opensAt": new Date("2019-12-04T08:00:00.000Z")});
});
