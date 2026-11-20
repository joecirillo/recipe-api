import { describe, expect, it } from 'vitest'
import { parseDurationMinutes } from './duration'

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
