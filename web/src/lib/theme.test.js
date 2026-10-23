import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, themeColor } from './theme.js'

test('resolveTheme: explicit choice wins, anything else follows the phone', () => {
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme(undefined, false), 'light')
  assert.equal(resolveTheme('{garbage', true), 'dark')
})

test('themeColor follows the resolved theme, not the phone', () => {
  assert.equal(themeColor('dark'), '#0A0A0E')
  assert.equal(themeColor('light'), '#F4EFE6')
})
