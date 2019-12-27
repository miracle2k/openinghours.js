# Why we use the Luxon library

We need to do various kinds of date/time arithmetic as part of evaluating a opening hours ruleset, enough that
an external library, on top of the native `Date` class, is helpful. Additional complexity comes with the desire
to properly support timezones, in particular, a set of opening hour rules may be written for a particular
timezone, while JavaScript's `Date` always uses the local timezone.

Two libraries were considered:

- `date-fns`
- `luxon`

The original version was written using `date-fns`; I assumed that we could reach a smaller output bundle size,
because we can tree-shake and only include those date operators we really need.

However, the complexity cost of `date-fns` on the code base in this case is immense, because it works with native 
`Date` objects itself. So for timezone calculations, the situation is as follows:   

- Javascript `Date` objects cannot carry a timezone. They are always set in the host machine time zone.
- Because we know the host machine timezone, we know the moment in time a `Date` points to, and so, we can
  *calculate* what the time would be any other timezone.
- We can also do the reverse: If we want to represent a certain moment time in a certain timezone A as a `Date`
  object, we can calculate the time in the local timezone that represents that desired moment in time.
- `date-fns-tz` can do those calculations.
- The pertinent point however is that the name of the source timezone A has been lost.
- This is important if we want to know what day of the week was intended, which is relevant for us
  when evaluating our rules, for example regarding the `dayOfWeek` option.

As a result, for cases where we need to know the "day of the week" intended, we must carry both the `date`
instance and the `timezone` it refers to. This caused us to build our own `DateWithTZ` object, which then infected
the whole library and required wrapping essentially all `date-fns` helpers to work with this structure, and give 
proper consideration to the timezone. At this point we are writing a lot of code, with easily made mistakes
when converting between timezones, having to consider the performance implications of those conversions etc.

`luxon` already gives us a `DateTime` object which can carry timezone information. Do we have to pay for this 
convenience with a larger bundle size? Apparently barely:

211 KB openinghours.js with `luxon` (tree shaking not supported by luxon)
193 KB openinghours.js with `date-fns` and tree-shaking enabled
486 KB openinghours.js with `date-fns` and tree-shaking disabled

So the trade-off here is a slightly larger bundle size for a *considerable* reduction in complexity.
