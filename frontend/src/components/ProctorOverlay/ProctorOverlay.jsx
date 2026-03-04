import React, { useEffect, useRef, useState } from 'react'
import styles from './ProctorOverlay.module.scss'
import { startAudioCapture, stopAudioCapture } from '../../utils/audioCapture'

export default function ProctorOverlay({ attemptId, token, onViolation, config = {} }) {
  const [status, setStatus] = useState('disconnected')
  const [alerts, setAlerts] = useState([])
  const wsRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const screenIntervalRef = useRef(null)

  // Start camera
  useEffect(() => {
    let cancelled = false
    async function startCam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (e) {
        console.error('Camera access failed', e)
      }
    }
    startCam()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  // WebSocket connection + frame streaming
  useEffect(() => {
    if (!attemptId || !token) return

    const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/^http/, 'ws')
    const ws = new WebSocket(`${baseUrl}/proctoring/${attemptId}/ws?token=${token}`)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      const frameInterval = config.frame_interval_ms || 3000
      intervalRef.current = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || !videoRef.current) return
        const canvas = canvasRef.current || document.createElement('canvas')
        canvasRef.current = canvas
        canvas.width = 320
        canvas.height = 240
        const ctx = canvas.getContext('2d')
        ctx.drawImage(videoRef.current, 0, 0, 320, 240)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        const base64 = dataUrl.split(',')[1]
        ws.send(JSON.stringify({ type: 'frame', data: base64 }))
      }, frameInterval)

      if (config.screen_capture) {
        navigator.mediaDevices.getDisplayMedia({ video: true }).then(screenStream => {
          const track = screenStream.getVideoTracks()[0]
          const scCanvas = document.createElement('canvas')
          screenIntervalRef.current = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN || !track) return
            const imageCapture = new ImageCapture(track)
            imageCapture.grabFrame().then(bitmap => {
              scCanvas.width = bitmap.width
              scCanvas.height = bitmap.height
              const ctx = scCanvas.getContext('2d')
              ctx.drawImage(bitmap, 0, 0)
              const dataUrl = scCanvas.toDataURL('image/jpeg', 0.6)
              const base64 = dataUrl.split(',')[1]
              ws.send(JSON.stringify({ type: 'screen', data: base64 }))
            }).catch(() => {})
          }, (config.screenshot_interval_sec || 60) * 1000)
        }).catch(() => {})
      }

      const stream = streamRef.current
      if (stream && stream.getAudioTracks().length > 0) {
        startAudioCapture(stream, (b64) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'audio', data: b64 }))
          }
        }, config.audio_chunk_ms || 3000).catch(() => {})
      }
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'alert') {
          setAlerts(prev => [msg, ...prev].slice(0, 5))
          onViolation?.(msg)
        } else if (msg.type === 'forced_submit') {
          onViolation?.({ severity: 'HIGH', event_type: 'FORCED_SUBMIT', detail: 'Exam auto-submitted due to violations' })
          window.location.href = `/attempts/${attemptId}`
        }
      } catch (_) {}
    }

    ws.onclose = () => setStatus('closed')
    ws.onerror = () => setStatus('disconnected')

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current)
      stopAudioCapture()
      ws.close()
    }
  }, [attemptId, token, config])

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Proctoring</span>
        <span className={`${styles.dot} ${styles[status]}`} title={status} />
      </div>

      <div className={styles.videoWrap}>
        <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
      </div>

      <div className={styles.statusText}>
        {status === 'connected' ? 'Monitoring active' : status === 'closed' ? 'Connection closed' : 'Connecting...'}
      </div>

      {alerts.length > 0 && (
        <div className={styles.alerts}>
          <div className={styles.alertsLabel}>Recent Alerts</div>
          {alerts.map((a, idx) => (
            <div key={idx} className={`${styles.alert} ${styles['alert' + a.severity]}`}>
              <strong>{a.severity}</strong> {a.event_type}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
