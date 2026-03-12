import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('./', import.meta.url))
const frontendRoot = path.resolve(scriptsDir, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const generatedRoot = path.join(frontendRoot, '.generated-tests')
const runId = `e2e-${process.pid}-${Date.now()}`
const e2eRoot = path.join(generatedRoot, runId)
const mirroredE2eRoot = path.join(repoRoot, '_workspace_nonruntime', 'tests', 'frontend', 'tests', 'e2e')
const expectedFixtureRoot = path.join(frontendRoot, 'tests', 'e2e')
const mirroredFixtureRoot = path.join(mirroredE2eRoot, 'fixtures')
const playwrightCli = path.join(frontendRoot, 'node_modules', '@playwright', 'test', 'cli.js')

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_TEST_DIR: path.relative(frontendRoot, e2eRoot),
      },
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`Command failed with exit code ${code}`))
    })
    child.on('error', reject)
  })
}

async function prepareMirroredE2eTests() {
  await fs.rm(e2eRoot, { recursive: true, force: true })
  await fs.rm(expectedFixtureRoot, { recursive: true, force: true })
  await fs.mkdir(generatedRoot, { recursive: true })
  await fs.cp(mirroredE2eRoot, e2eRoot, { recursive: true, force: true })
  await fs.mkdir(expectedFixtureRoot, { recursive: true })
  await fs.cp(mirroredFixtureRoot, path.join(expectedFixtureRoot, 'fixtures'), { recursive: true, force: true })
}

async function cleanupMirroredTests() {
  await fs.rm(e2eRoot, { recursive: true, force: true })
  await fs.rm(expectedFixtureRoot, { recursive: true, force: true })
}

async function main() {
  await prepareMirroredE2eTests()
  try {
    await runCommand(process.execPath, [playwrightCli, 'test', '--config', 'playwright.config.js', ...process.argv.slice(2)])
  } finally {
    await cleanupMirroredTests()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
