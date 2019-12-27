A work on progress. Does not handle many, many quite common cases, but works for basic ones.

I could not find another library dealing with opening hours that does the following:

- Supports the data structure behind the schema.org specification: https://schema.org/OpeningHoursSpecification
- Can calculate when a business will next open or close.


# Documentation

## Notes on timezones

The library ignores timezones in the sense that it expects all date and time units to use
a single timezone of your choosing. 

By default, a method such as `getCurrentState()` tests the opening hours configuration
against a `Date` object in the local timezone, so it would make sense to specify opening
and closing times in the local timezone as well.

However, feel free to use UTC times, and pass a UTC Date object into `getCurrentState()`
if you prefer. 
