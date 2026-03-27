import { describe, expect, it } from 'vitest'

import { canReusePostLoginPath, resolvePostLoginPath } from './postLoginRedirect'

describe('postLoginRedirect', () => {
  it('always sends admins to the dashboard after login', () => {
    expect(resolvePostLoginPath('ADMIN', '/admin/tests')).toBe('/admin/dashboard')
    expect(resolvePostLoginPath('ADMIN', '/admin/users')).toBe('/admin/dashboard')
    expect(resolvePostLoginPath('ADMIN', '/profile')).toBe('/admin/dashboard')
    expect(resolvePostLoginPath('ADMIN', '')).toBe('/admin/dashboard')
    expect(resolvePostLoginPath('ADMIN', 'not-a-path')).toBe('/admin/dashboard')
  })

  it('does not reuse admin deep links after login', () => {
    expect(canReusePostLoginPath('ADMIN', '/admin/tests')).toBe(false)
    expect(canReusePostLoginPath('ADMIN', '/admin/users')).toBe(false)
  })

  it('preserves learner and instructor post-login routes', () => {
    expect(resolvePostLoginPath('LEARNER', '/tests')).toBe('/tests')
    expect(resolvePostLoginPath('LEARNER', '/attempts/attempt-1')).toBe('/attempts/attempt-1')
    expect(resolvePostLoginPath('LEARNER', '/training')).toBe('/training')
    expect(resolvePostLoginPath('INSTRUCTOR', '/admin/categories')).toBe('/admin/categories')
    expect(resolvePostLoginPath('INSTRUCTOR', '/profile')).toBe('/profile')
  })

  it('does not reuse learner-only routes for instructors after login', () => {
    expect(canReusePostLoginPath('INSTRUCTOR', '/training')).toBe(false)
    expect(canReusePostLoginPath('INSTRUCTOR', '/surveys')).toBe(false)
    expect(resolvePostLoginPath('INSTRUCTOR', '/training')).toBe('/profile')
    expect(resolvePostLoginPath('INSTRUCTOR', '')).toBe('/profile')
  })
})
