let audioCtx = null
let processor = null
let sourceNode = null

function encodePcm16ToBase64(int16Array) {
  const bytes = new Uint8Array(int16Array.buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function startAudioCapture(stream, onChunk, intervalMs = 1000) {
  if (!stream) throw new Error('Stream required')
  stopAudioCapture()

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    sourceNode = audioCtx.createMediaStreamSource(stream)
    processor = audioCtx.createScriptProcessor(2048, 1, 1)
    const buffer = []
    let lastEmit = performance.now()

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      const pcm16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff
      }
      buffer.push(pcm16)
      const now = performance.now()
      if (now - lastEmit >= intervalMs) {
        const totalLength = buffer.reduce((sum, arr) => sum + arr.length, 0)
        const merged = new Int16Array(totalLength)
        let offset = 0
        buffer.forEach(arr => { merged.set(arr, offset); offset += arr.length })
        const b64 = encodePcm16ToBase64(merged)
        onChunk(b64)
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
  processor?.disconnect()
  sourceNode?.disconnect()
  audioCtx?.close()
  processor = null
  sourceNode = null
  audioCtx = null
}
