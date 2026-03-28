/**
 * Live site audit — https://testme.zedny.ai
 * Runs as admin + learner, captures console errors, page errors, failed API calls,
 * visible error banners, and takes screenshots of every page.
 */
import { test, expect } from '@playwright/test'

const BASE = 'https://testme.zedny.ai'
const API_BASE = 'https://testme.zedny.ai/api/'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Password123!'

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/tests',
  '/admin/tests/new',
  '/admin/categories',
  '/admin/grading-scales',
  '/admin/question-pools',
  '/admin/sessions',
  '/admin/schedules',
  '/admin/candidates',
  '/admin/attempt-analysis',
  '/admin/users',
  '/admin/roles',
  '/admin/templates',
  '/admin/certificates',
  '/admin/reports',
  '/admin/courses',
  '/admin/user-groups',
  '/admin/settings',
  '/admin/surveys',
  '/admin/predefined-reports',
  '/admin/favorite-reports',
  '/admin/report-builder',
  '/admin/integrations',
  '/admin/maintenance',
  '/admin/subscribers',
  '/admin/audit-log',
]

const LEARNER_ROUTES = [
  '/',
  '/tests',
  '/schedule',
  '/attempts',
  '/training',
  '/surveys',
  '/profile',
]

const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password?token=demo-token',
]

async function loginViaUI(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/(admin|tests|\?|$)/, { timeout: 15000 }).catch(() => {})
}

function attachCollectors(page) {
  const issues = { console: [], pageErrors: [], failedRequests: [], visibleErrors: [] }

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Filter noisy/irrelevant browser warnings
      if (
        text.includes('favicon') ||
        text.includes('net::ERR_') ||
        text.includes('Failed to load resource') ||
        text.includes('Content Security Policy')
      ) return
      issues.console.push({ text, url: page.url() })
    }
  })

  page.on('pageerror', err => {
    issues.pageErrors.push({ message: err.message, url: page.url() })
  })

  page.on('response', res => {
    const url = res.url()
    const status = res.status()
    if (status >= 400 && url.includes('/api/')) {
      // 401s on logout/token expiry are expected; 404 on attempt-analysis with no selection is expected
      if (status === 401) return
      issues.failedRequests.push({ status, url, route: page.url() })
    }
  })

  return issues
}

async function checkVisibleErrors(page) {
  const errorPhrases = [
    'Internal server error',
    'Something went wrong',
    'The server took too long',
    'Unexpected error',
    'Network error',
  ]
  const found = []
  for (const phrase of errorPhrases) {
    const el = page.getByText(phrase, { exact: false })
    if (await el.count() > 0 && await el.first().isVisible().catch(() => false)) {
      found.push(phrase)
    }
  }
  return found
}

async function visitRoutes(page, routes, issues, label) {
  const results = []
  for (const route of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(1500)

    const visErr = await checkVisibleErrors(page)
    const finalUrl = page.url()
    const wrongRedirect = finalUrl.includes('/login') && route !== '/login'

    results.push({
      route,
      finalUrl,
      redirectedToLogin: wrongRedirect,
      visibleErrors: visErr,
      pageTitle: await page.title().catch(() => '?'),
    })

    if (wrongRedirect) {
      issues.visibleErrors.push(`${label} ${route} → redirected to login (auth broken)`)
    }
    if (visErr.length > 0) {
      issues.visibleErrors.push(`${label} ${route} → visible error: ${visErr.join(', ')}`)
    }
  }
  return results
}

test.describe('Live site audit — testme.zedny.ai', () => {
  test.setTimeout(300_000)

  test('public routes load without errors', async ({ page }) => {
    const issues = attachCollectors(page)
    const results = []

    for (const route of PUBLIC_ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(800)
      const visErr = await checkVisibleErrors(page)
      results.push({ route, url: page.url(), title: await page.title(), visibleErrors: visErr })
    }

    console.log('\n=== PUBLIC ROUTES ===')
    for (const r of results) {
      console.log(`  ${r.route} → ${r.url} (${r.title})${r.visibleErrors.length ? ' ⚠ ' + r.visibleErrors.join(', ') : ' ✓'}`)
    }

    const allIssues = [...issues.pageErrors, ...issues.console]
    if (allIssues.length) {
      console.log('\n⚠ Public route issues:', JSON.stringify(allIssues, null, 2))
    }

    expect(issues.pageErrors, 'JS page errors on public routes').toEqual([])
  })

  test('admin: all routes load correctly', async ({ page, context }) => {
    const issues = { console: [], pageErrors: [], failedRequests: [], visibleErrors: [] }
    const collector = attachCollectors(page)
    Object.assign(issues, collector)

    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    const postLoginUrl = page.url()
    console.log(`\n Admin login → ${postLoginUrl}`)

    if (postLoginUrl.includes('/login')) {
      test.fail(true, `Admin login failed — still on login page. Check credentials: ${ADMIN_EMAIL}`)
      return
    }

    const results = await visitRoutes(page, ADMIN_ROUTES, issues, '[admin]')

    console.log('\n=== ADMIN ROUTES ===')
    for (const r of results) {
      const status = r.redirectedToLogin ? '🔴 AUTH FAIL' : r.visibleErrors.length ? '⚠ ERROR' : '✓'
      console.log(`  ${status} ${r.route} → ${r.finalUrl}`)
      if (r.visibleErrors.length) console.log(`       visible: ${r.visibleErrors.join(', ')}`)
    }

    if (issues.failedRequests.length) {
      console.log('\n⚠ Failed API requests (admin):')
      for (const r of issues.failedRequests) {
        console.log(`  ${r.status} ${r.url}  (on page ${r.route})`)
      }
    }
    if (issues.pageErrors.length) {
      console.log('\n⚠ JS page errors (admin):')
      for (const e of issues.pageErrors) {
        console.log(`  ${e.message}  (at ${e.url})`)
      }
    }
    if (issues.console.length) {
      console.log('\n⚠ Console errors (admin):')
      for (const e of issues.console) {
        console.log(`  ${e.text}  (at ${e.url})`)
      }
    }

    const broken = results.filter(r => r.redirectedToLogin || r.visibleErrors.length > 0)
    expect(broken, `Broken admin routes: ${broken.map(r => r.route).join(', ')}`).toEqual([])
    expect(issues.pageErrors, 'JS errors on admin routes').toEqual([])
    expect(issues.failedRequests.filter(r => r.status >= 500), '5xx API errors on admin routes').toEqual([])
  })

  test('learner: all routes load correctly', async ({ page, context }) => {
    const LEARNER_EMAIL = process.env.LEARNER_EMAIL
    const LEARNER_PASSWORD = process.env.LEARNER_PASSWORD

    if (!LEARNER_EMAIL || !LEARNER_PASSWORD) {
      test.skip(true, 'Set LEARNER_EMAIL and LEARNER_PASSWORD env vars to test learner routes')
      return
    }

    const issues = { console: [], pageErrors: [], failedRequests: [], visibleErrors: [] }
    Object.assign(issues, attachCollectors(page))

    await loginViaUI(page, LEARNER_EMAIL, LEARNER_PASSWORD)
    const postLoginUrl = page.url()

    if (postLoginUrl.includes('/login')) {
      test.fail(true, `Learner login failed`)
      return
    }

    const results = await visitRoutes(page, LEARNER_ROUTES, issues, '[learner]')

    console.log('\n=== LEARNER ROUTES ===')
    for (const r of results) {
      const status = r.redirectedToLogin ? '🔴 AUTH FAIL' : r.visibleErrors.length ? '⚠ ERROR' : '✓'
      console.log(`  ${status} ${r.route}`)
    }

    if (issues.failedRequests.length) {
      console.log('\n⚠ Failed API requests (learner):')
      for (const r of issues.failedRequests) console.log(`  ${r.status} ${r.url}`)
    }

    const broken = results.filter(r => r.redirectedToLogin || r.visibleErrors.length > 0)
    expect(broken, `Broken learner routes: ${broken.map(r => r.route).join(', ')}`).toEqual([])
    expect(issues.pageErrors, 'JS errors on learner routes').toEqual([])
    expect(issues.failedRequests.filter(r => r.status >= 500), '5xx API errors on learner routes').toEqual([])
  })
})
