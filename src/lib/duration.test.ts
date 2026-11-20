import { describe, expect, it } from 'vitest'
import { parseDurationMinutes, parsePlainDurationMinutes } from './duration'

describe('parseDurationMinutes', () => {
  it.each([
    ['PT1H30M', 90],
    ['PT45M', 45],
    ['P1DT2H3M4S', 1564],
    ['PT0S', 0],
    ['P0D', 0],
    ['PT1S', 1],
    ['PT60S', 1],
    ['PT60.1S', 2],
    ['PT0.5S', 1],
    ['PT1M1S', 2],
    ['P0Y0M0DT0H25M0.000S', 25],
    ['P0Y0M0DT1H0M0.000S', 60],
    ['P0Y0M0W0DT0H0M30.5S', 1],
    ['P0Y', 0],
  ])('parses %s into %s whole minutes, rounding up', (input, expected) => {
    expect(parseDurationMinutes(input)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    45,
    {},
    [],
    '',
    'P',
    'PT',
    'P1DT',
    'PT-1M',
    'PT1.5H',
    'P1Y',
    'P2M',
    'P1M',
    'P1W',
    'P1Y0M0DT0H25M',
    'P0Y2M0DT0H25M',
    'P0M0Y0DT25M',
    'P0Y0M0DT0H25M0.S',
    '45 minutes',
    'pt45m',
    ' PT45M ',
    'PT45M\n',
    'PT1M2H',
    'PT1Mextra',
    'PT9999999999999999999999999H',
  ])('returns null for unsupported or invalid input %j', (input) => {
    expect(parseDurationMinutes(input)).toBeNull()
  })
})

describe('parsePlainDurationMinutes', () => {
  it.each([
    ['20 minutes', 20],
    ['40 minutes', 40],
    ['1 minute', 1],
    ['5 min', 5],
    ['15 mins', 15],
    ['2 hr', 120],
    ['3 hrs', 180],
    ['1 hour', 60],
    ['2 hours', 120],
    ['1 hour 20 minutes', 80],
    ['1 hr 5 mins', 65],
    ['  1 Hour  20 Minutes ', 80],
    ['0 minutes', 0],
  ])('parses %j into %s minutes', (input, expected) => {
    expect(parsePlainDurationMinutes(input)).toBe(expected)
  })

  it.each([
    undefined,
    null,
    20,
    '',
    ' ',
    'about 20 minutes',
    '20-25 minutes',
    '20 to 25 minutes',
    '1.5 hours',
    '20minutes',
    '1 hour20 minutes',
    '1 hour and 20 minutes',
    '1 hour, 20 minutes',
    '20 minutes 1 hour',
    '1 hour 1 hour',
    '20 seconds',
    '1 day',
    'minutes',
    'PT20M',
    '9999999999999999999 hours',
  ])('returns null for unsupported input %j', (input) => {
    expect(parsePlainDurationMinutes(input)).toBeNull()
  })
})
