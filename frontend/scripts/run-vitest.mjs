import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptsDir = fileURLToPath(new URL('./', import.meta.url))
const frontendRoot = path.resolve(scriptsDir, '..')
const repoRoot = path.resolve(frontendRoot, '..')
const generatedRoot = path.join(frontendRoot, '.generated-tests')
const unitRoot = path.join(generatedRoot, 'unit')
const sourceRoot = path.join(frontendRoot, 'src')
const mirroredTestsRoot = path.join(repoRoot, '_workspace_nonruntime', 'tests', 'frontend', 'src')
const vitestCli = path.join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs')

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: frontendRoot,
      stdio: 'inherit',
      env: process.env,
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

async function prepareMirroredUnitTests() {
  await fs.rm(unitRoot, { recursive: true, force: true })
  await fs.mkdir(unitRoot, { recursive: true })
  await fs.cp(sourceRoot, path.join(unitRoot, 'src'), { recursive: true, force: true })
  await fs.cp(mirroredTestsRoot, path.join(unitRoot, 'src'), { recursive: true, force: true })
}

async function cleanupMirroredTests() {
  await fs.rm(unitRoot, { recursive: true, force: true })
}

async function main() {
  await prepareMirroredUnitTests()
  try {
    await runCommand(process.execPath, [vitestCli, 'run', '--config', 'vitest.config.js', ...process.argv.slice(2)])
  } finally {
    await cleanupMirroredTests()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
