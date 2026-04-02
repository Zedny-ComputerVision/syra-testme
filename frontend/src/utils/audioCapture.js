let audioCtx = null
let processor = null
let sourceNode = null
let isCapturing = false

function encodePcm16ToBase64(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Downsample float32 audio from nativeRate → 16000 Hz using linear interpolation.
 * WebRTC VAD (server-side) requires exactly 16000 Hz int16 PCM.
 */
const TARGET_RATE = 16000

function downsampleLinear(buffer, inputRate) {
  if (inputRate === TARGET_RATE) return buffer
  const ratio = inputRate / TARGET_RATE
  const outputLength = Math.floor(buffer.length / ratio)
  const output = new Float32Array(outputLength)
  for (let i = 0; i < outputLength; i++) {
    const src = i * ratio
    const srcFloor = Math.floor(src)
    const srcCeil = Math.min(buffer.length - 1, srcFloor + 1)
    const frac = src - srcFloor
    output[i] = buffer[srcFloor] * (1 - frac) + buffer[srcCeil] * frac
  }
  return output
}

export async function startAudioCapture(stream, onChunk, intervalMs = 1000) {
  if (!stream) throw new Error('Stream required')
  if (isCapturing) return // already active, prevent race condition
  isCapturing = true
  stopAudioCapture()

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const nativeRate = audioCtx.sampleRate
    sourceNode = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(2048, 1, 1)
    const buffer = []
    let lastEmit = performance.now()

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      // Downsample to 16kHz so WebRTC VAD works correctly on the server
      const resampled = downsampleLinear(input, nativeRate)
      const pcm16 = new Int16Array(resampled.length)
      for (let i = 0; i < resampled.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, resampled[i])) * 0x7fff
      }
      buffer.push(pcm16)
      const now = performance.now()
      if (now - lastEmit >= intervalMs) {
        const totalLength = buffer.reduce((sum, arr) => sum + arr.length, 0)
        const merged = new Int16Array(totalLength)
        let offset = 0
        buffer.forEach(arr => { merged.set(arr, offset); offset += arr.length })
        const b64 = encodePcm16ToBase64(merged)
        // Pass TARGET_RATE so backend knows the audio format for WebRTC VAD
        onChunk(b64, TARGET_RATE)
        buffer.length = 0
        lastEmit = now
      }
    }

    sourceNode.connect(processor)
    processor.connect(audioCtx.destination)
    return stopAudioCapture
  } catch (error) {
    stopAudioCapture()
    throw error
  }
}

export function stopAudioCapture() {
  isCapturing = false
  processor?.disconnect()
  sourceNode?.disconnect()
  audioCtx?.close()
  processor = null
  sourceNode = null
  audioCtx = null
}
