# openinghours.js

Given an opening hours structure as defined by [schema.org/OpeningHoursSpecification](https://schema.org/OpeningHoursSpecification),
and as used by [Google](https://developers.google.com/search/docs/data-types/local-business#business_hours), this can
tell you if at a particular point in time the entity is open, and when it will close, or the reverse.

This is still a work on progress and might fail to return the right result in edge cases, but seems to handle most 
common cases, and comes with a test suite.


## Install

```bash
$ yarn add openinghours.js
$ npm install --save openinghours.js
```

# Documentation

## The data structure

Define your opening hours using this data structure:

```javascript
const rules = [
  // This applies to every day
  {
    opens: '08:00',
    closes: '18:00'
  },
  {
    // This applies to any monday or tuesday.
    dayOfWeek: ['monday', 'tuesday'],
    // 00:00 - 00:00 means closed the whole day.
    opens: '00:00',
    closes: '00:00',
  },
  {
    // This applies to any sunday in December 2019
    dayOfWeek: ['sunday'],
    validFrom: '2019-12-01',
    validThrough: '2019-12-21',
    // 00:00 - 23:59 means open the whole day.
    opens: '00:00',
    closes: '23:59',
  },
];
```

## The main query function

Query the state at a given point in time:

```javascript
import {getCurrentState} from 'openinghours.js';

getCurrentState(
  rules,
  {
    date: new Date()
  }
);
```

The return value is an object such as: 

```javascript
const result = {
  isOpen: true,
  closesAt: new Date("2019-12-05T14:00:00.000Z")
}
```

```javascript
const result = {
  isOpen: false,
  opensAt: new Date("2019-12-05T14:00:00.000Z")
}
```

## A note on timezones

The library fully supports timezones.

For any time values given in the rule set, you can pass a `rulesTimezone` option:

```javascript
getCurrentState(
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
```

If you run the above on a GMT machine (so the time queried will be 07:30 GMT) while Europe/Berlin is `GMT+1`, then
the result will be "is open", because the shop opened at 7am in GMT time (and at 8am in Europe/Berlin time).

If not given, we assume ``06:00`` means 6am in the local timezone.

For the date you want to query, you can pass a `luxon.DateTime` object instead of a native `Date`:

```javascript
import {getCurrentState} from 'openinghours.js';
import {DateTime} from 'luxon';

getCurrentState(
  rules,
  {
    date: DateTime.fromObject({ hour: 10, minute: 26, second: 6, year: 2019, month: 5, day: 25, zone: 'America/New_York' }),
    rulesTimezone: 'Europe/Berlin'
  }
);
```
 
Of you do not care about timezone, simply do not specify any. All calculations will run in whatever the local
timezone is, which will not matter to you. 


# Other libraries

I could not find another library dealing with opening hours that does the following:

- Supports the data structure behind the [schema.org specification](https://schema.org/OpeningHoursSpecification).
- Can calculate when a business will next open or close.