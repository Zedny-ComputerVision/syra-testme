import { test, expect, request as playwrightRequest } from '@playwright/test'
import { ensureAdmin, createLearner } from './helpers/api'

const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/'

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/tests',
  '/admin/tests/new',
  '/admin/categories',
  '/admin/grading-scales',
  '/admin/question-pools',
  '/admin/sessions',
  '/admin/candidates',
  '/admin/attempt-analysis',
  '/admin/users',
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
  '/training',
  '/surveys',
  '/attempts',
  '/schedule',
  '/profile',
]

function attachIssueCollectors(page) {
  const issues = {
    console: [],
    pageErrors: [],
    responses: [],
  }

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      issues.console.push({
        type: msg.type(),
        text: msg.text(),
        url: page.url(),
      })
    }
  })

  page.on('pageerror', (error) => {
    issues.pageErrors.push({
      message: error.message,
      url: page.url(),
    })
  })

  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(API_BASE)) {
      issues.responses.push({
        status: response.status(),
        url: response.url(),
        route: page.url(),
      })
    }
  })

  return issues
}

function formatIssues(label, issues) {
  return [
    `${label} console issues: ${JSON.stringify(issues.console, null, 2)}`,
    `${label} page errors: ${JSON.stringify(issues.pageErrors, null, 2)}`,
    `${label} failed API responses: ${JSON.stringify(issues.responses, null, 2)}`,
  ].join('\n')
}

async function bootstrapSession(page, token) {
  await page.goto('/login')
  await page.evaluate((accessToken) => {
    localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
  }, token)
}

async function visitRoutes(page, routes) {
  for (const route of routes) {
    await page.goto(route, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
  }
}

test('primary admin and learner route groups stay free of console, page, and API failures', async ({ page, context }) => {
  const admin = await ensureAdmin(context)
  const requestContext = await playwrightRequest.newContext({ baseURL: API_BASE })
  const learner = await createLearner(context, admin.token)
  const learnerLogin = await requestContext.post('auth/login', {
    data: { email: learner.email, password: learner.password },
  })
  const learnerBody = await learnerLogin.json()
  expect(learnerLogin.ok(), `learner login failed: ${learnerLogin.status()} ${JSON.stringify(learnerBody)}`).toBeTruthy()

  const learnerPage = await context.newPage()
  const adminIssues = attachIssueCollectors(page)
  const learnerIssues = attachIssueCollectors(learnerPage)

  await bootstrapSession(page, admin.token)
  await bootstrapSession(learnerPage, learnerBody.access_token)

  await visitRoutes(page, ADMIN_ROUTES)
  await visitRoutes(learnerPage, LEARNER_ROUTES)

  expect(
    [...adminIssues.console, ...adminIssues.pageErrors, ...adminIssues.responses],
    formatIssues('admin', adminIssues),
  ).toEqual([])
  expect(
    [...learnerIssues.console, ...learnerIssues.pageErrors, ...learnerIssues.responses],
    formatIssues('learner', learnerIssues),
  ).toEqual([])

  await learnerPage.close()
  await requestContext.dispose()
})
