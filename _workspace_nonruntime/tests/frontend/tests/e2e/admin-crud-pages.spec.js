import { test, expect } from '@playwright/test'
import { ensureAdmin } from './helpers/api'

async function bootstrapSession(page, token) {
  await page.goto('/login')
  await page.evaluate((accessToken) => {
    localStorage.setItem('syra_tokens', JSON.stringify({ access_token: accessToken }))
  }, token)
}

function tableRow(page, text) {
  return page.locator('tr').filter({ hasText: text }).first()
}

test.describe('Admin CRUD pages', () => {
  test('users support real user_id updates and groups manage learner membership', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    await bootstrapSession(page, token)

    const suffix = Date.now()
    const learnerName = `Group Learner ${suffix}`
    const learnerEmail = `group-learner-${suffix}@example.com`
    const learnerUserId = `GL${suffix}`
    const updatedUserId = `GLU${suffix}`
    const groupName = `Cohort ${suffix}`

    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: 'User Profiles' })).toBeVisible()

    await page.getByRole('button', { name: '+ New User' }).click()
    await page.locator('label:has-text("User ID") + input').fill(learnerUserId)
    await page.locator('label:has-text("Name") + input').fill(learnerName)
    await page.locator('label:has-text("Email") + input').fill(learnerEmail)
    await page.locator('label:has-text("Password") + input').fill('Password123!')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('User created.')).toBeVisible()

    const learnerRow = tableRow(page, learnerEmail)
    await expect(learnerRow).toBeVisible()
    await learnerRow.getByRole('button', { name: 'Edit' }).click()

    await page.locator('label:has-text("User ID") + input').fill(updatedUserId)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('User updated.')).toBeVisible()

    await page.reload()
    await expect(tableRow(page, learnerEmail)).toContainText(updatedUserId)

    await page.goto('/admin/user-groups')
    await expect(page.getByRole('heading', { name: 'User Groups' })).toBeVisible()

    const groupsMain = page.locator('main')
    await groupsMain.getByRole('textbox').nth(0).fill(groupName)
    await groupsMain.getByRole('textbox').nth(1).fill('E2E learner cohort')
    await groupsMain.getByRole('button', { name: 'Save Group' }).click()
    await expect(page.getByText('Group created.')).toBeVisible()
    await expect(page.getByText(`Members - ${groupName}`)).toBeVisible()

    const memberSelect = groupsMain.locator('select').first()
    await memberSelect.selectOption({ label: `${learnerName} (${learnerEmail})` })
    await page.getByRole('button', { name: 'Add' }).click()
    await expect(groupsMain.locator('div').filter({ hasText: learnerEmail }).filter({ has: page.getByRole('button', { name: 'Remove' }) }).first()).toBeVisible()

    const memberRow = groupsMain.locator('div').filter({ hasText: learnerEmail }).filter({ has: page.getByRole('button', { name: 'Remove' }) }).first()
    await memberRow.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Member removed.')).toBeVisible()
    await expect(page.getByText('No members in this group.')).toBeVisible()
  })

  test('courses, templates, and surveys persist real create and update flows', async ({ page, context }) => {
    const { token } = await ensureAdmin(context)
    await bootstrapSession(page, token)

    const suffix = Date.now()
    const courseTitle = `Course ${suffix}`
    const moduleTitle = `Module ${suffix}`
    const templateName = `Template ${suffix}`
    const updatedTemplateName = `Template ${suffix} Updated`
    const surveyTitle = `Survey ${suffix}`

    await page.goto('/admin/courses')
    await expect(page.getByRole('heading', { name: 'Training Courses' })).toBeVisible()

    const coursesMain = page.locator('main')
    await coursesMain.getByRole('textbox').nth(0).fill(courseTitle)
    await coursesMain.getByRole('textbox').nth(1).fill('Course created in e2e')
    await coursesMain.getByRole('button', { name: 'Save Course' }).click()
    await expect(page.getByText('Course created.')).toBeVisible()

    await expect(coursesMain.getByText(courseTitle)).toBeVisible()
    await coursesMain.getByPlaceholder('New module title').first().fill(moduleTitle)
    await coursesMain.getByRole('button', { name: 'Add' }).first().click()
    await expect(page.getByText('Module added.')).toBeVisible()
    await expect(page.getByText(moduleTitle)).toBeVisible()

    await page.goto('/admin/templates')
    await expect(page.getByRole('heading', { name: 'Test Templates' })).toBeVisible()

    await page.locator('label:has-text("Name") + input').fill(templateName)
    await page.locator('label:has-text("Description") + input').fill('Template created in e2e')
    await page.getByRole('button', { name: 'Save Template' }).click()
    await expect(page.getByText('Template created.')).toBeVisible()

    const templateRow = page.locator('[data-template-row="true"]').filter({ hasText: templateName }).first()
    await templateRow.getByRole('button', { name: 'Edit' }).click()
    await page.locator('label:has-text("Name") + input').fill(updatedTemplateName)
    await page.getByRole('button', { name: 'Update Template' }).click()
    await expect(page.getByText('Template updated.')).toBeVisible()
    await expect(page.getByText(updatedTemplateName)).toBeVisible()

    await page.goto('/admin/surveys')
    await expect(page.getByRole('heading', { name: 'Surveys' })).toBeVisible()

    const surveysMain = page.locator('main')
    const surveyForm = surveysMain.locator('form').first()
    await surveyForm.getByRole('textbox').nth(0).fill(surveyTitle)
    await surveyForm.getByPlaceholder('Question 1').fill('Was the workflow clear?')
    await surveyForm.getByRole('button', { name: 'Save Survey' }).click()
    await expect(page.getByText('Survey created.')).toBeVisible()

    const surveyRow = surveysMain.locator('div').filter({ hasText: surveyTitle }).filter({ has: page.getByRole('button', { name: 'Deactivate' }) }).first()
    await expect(surveyRow).toBeVisible()
    await surveyRow.getByRole('button', { name: 'Deactivate' }).click()
    await expect(page.getByText('Survey deactivated.')).toBeVisible()
  })
})
