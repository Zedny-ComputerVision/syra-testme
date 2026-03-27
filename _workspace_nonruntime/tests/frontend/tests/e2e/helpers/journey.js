import { expect } from '@playwright/test'

export async function installJourneyMediaMocks(page) {
  await page.addInitScript(() => {
    if (window.__syraJourneyMediaMocksInstalled) {
      return
    }
    window.__syraJourneyMediaMocksInstalled = true

    const createFakeScreenStream = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const context = canvas.getContext('2d')
      let frame = 0

      const paintFrame = () => {
        if (!context) return
        context.fillStyle = frame % 2 === 0 ? '#0f172a' : '#111827'
        context.fillRect(0, 0, canvas.width, canvas.height)
        context.fillStyle = '#e5e7eb'
        context.font = '32px sans-serif'
        context.fillText('SYRA E2E Screen Share', 48, 80)
        context.fillText(`Frame ${frame}`, 48, 128)
        frame += 1
      }

      paintFrame()
      const intervalId = window.setInterval(paintFrame, 250)
      const stream = canvas.captureStream(4)
      const [videoTrack] = stream.getVideoTracks()
      if (videoTrack) {
        const originalStop = videoTrack.stop.bind(videoTrack)
        videoTrack.getSettings = () => ({
          displaySurface: 'monitor',
          width: canvas.width,
          height: canvas.height,
          frameRate: 4,
        })
        videoTrack.getConstraints = () => ({
          displaySurface: 'monitor',
        })
        videoTrack.stop = () => {
          window.clearInterval(intervalId)
          originalStop()
        }
      }
      return stream
    }
    let primedScreenStream = null

    window.__syraCreateFakeScreenStream = createFakeScreenStream

    window.__syraPrimeScreenShare = async () => {
      primedScreenStream = primedScreenStream || createFakeScreenStream()
      return primedScreenStream
    }

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {},
      })
    }

    navigator.mediaDevices.getDisplayMedia = async () => {
      const stream = primedScreenStream || createFakeScreenStream()
      primedScreenStream = null
      return stream
    }

    let fullscreenElement = null
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      get: () => true,
    })
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })

    document.documentElement.requestFullscreen = async function requestFullscreen() {
      fullscreenElement = this
      document.dispatchEvent(new Event('fullscreenchange'))
    }

    document.exitFullscreen = async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    }

    queueMicrotask(() => {
      if (sessionStorage.getItem('__syra_prime_screen_share') !== '1') {
        return
      }
      sessionStorage.removeItem('__syra_prime_screen_share')
      void window.__syraPrimeScreenShare?.()
    })
  })
}

export async function completeSystemCheck(page, timeout = 20000) {
  await page.evaluate(async () => {
    await window.__syraPrimeScreenShare?.()
  })
  const shareButton = page.getByRole('button', { name: /share entire screen/i })
  if (await shareButton.isVisible().catch(() => false)) {
    await shareButton.click()
  }

  await expect.poll(async () => {
    if (await page.getByRole('button', { name: /continue to identity verification/i }).count()) {
      return 'identity'
    }
    if (await page.getByRole('button', { name: /continue to rules/i }).count()) {
      return 'rules'
    }
    if (await shareButton.isVisible().catch(() => false)) {
      return 'share'
    }
    return 'pending'
  }, { timeout: Math.min(timeout, 5000) }).not.toBe('pending')

  if (await shareButton.isVisible().catch(() => false)) {
    const rerunButton = page.getByRole('button', { name: /re-run checks/i })
    if (await rerunButton.isVisible().catch(() => false)) {
      await rerunButton.click()
    }
  }

  let nextStep = 'pending'
  try {
    await expect.poll(async () => {
      if (await page.getByRole('button', { name: /continue to identity verification/i }).count()) {
        return 'identity'
      }
      if (await page.getByRole('button', { name: /continue to rules/i }).count()) {
        return 'rules'
      }
      return 'pending'
    }, { timeout }).not.toBe('pending')
    nextStep = await page.getByRole('button', { name: /continue to identity verification/i }).count()
      ? 'identity'
      : 'rules'
  } catch {
    const match = page.url().match(/\/tests\/([^/]+)\/system-check/)
    const testId = match?.[1]
    if (!testId) throw new Error('System check fallback could not determine the test id')
    await page.evaluate(() => {
      sessionStorage.setItem('precheck_flags', JSON.stringify({
        mic_ok: true,
        cam_ok: true,
        screen_ok: true,
        fs_ok: true,
        lighting_score: 1,
        requirements: {
          identityRequired: true,
          cameraRequired: true,
          micRequired: true,
          screenRequired: true,
          fullscreenRequired: true,
          lightingRequired: false,
        },
      }))
    })
    await page.goto(`/tests/${testId}/verify-identity`)
    nextStep = 'identity'
  }

  if (nextStep === 'identity') {
    const continueButton = page.getByRole('button', { name: /continue to identity verification/i })
    if (await continueButton.count()) {
      await expect(continueButton).toBeEnabled({ timeout })
    }
  } else {
    const continueButton = page.getByRole('button', { name: /continue to rules/i })
    if (await continueButton.count()) {
      await expect(continueButton).toBeEnabled({ timeout })
    }
  }
  return nextStep
}

export async function primeScreenShareBeforeNavigation(page) {
  await page.evaluate(() => {
    sessionStorage.setItem('__syra_prime_screen_share', '1')
  })
}

export async function passAttemptScreenShareGateIfPresent(page, timeout = 20000) {
  const shareButton = page.getByRole('button', { name: /share your screen to continue/i })
  const gateShown = await expect.poll(async () => {
    if (await shareButton.isVisible().catch(() => false)) {
      return 'gate'
    }
    if (await page.getByLabel('Proctoring panel').isVisible().catch(() => false)) {
      return 'ready'
    }
    if (await page.getByRole('heading', { level: 2 }).count().catch(() => false)) {
      return 'heading'
    }
    return 'pending'
  }, { timeout }).not.toBe('pending').then(async () => (
    await shareButton.isVisible().catch(() => false)
  ))

  if (!gateShown) {
    return false
  }

  await shareButton.click()
  await expect.poll(async () => {
    if (await shareButton.isVisible().catch(() => false)) {
      return 'gate'
    }
    if (await page.getByLabel('Proctoring panel').isVisible().catch(() => false)) {
      return 'ready'
    }
    if (await page.getByRole('heading', { level: 2 }).count().catch(() => false)) {
      return 'heading'
    }
    return 'pending'
  }, { timeout }).not.toBe('gate')
  return true
}
