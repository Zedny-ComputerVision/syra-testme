import { useState, useEffect, useRef } from 'react';

interface ProctoringHookResult {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    alerts: string[];
    isActive: boolean;
    startProctoring: () => Promise<void>;
    stopProctoring: () => void;
}

interface ProctoringHookProps {
    onViolation?: (message: string, type: 'critical' | 'warning') => void;
    sessionId?: number | null;
}

export const useProctoring = (props?: ProctoringHookProps): ProctoringHookResult => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [alerts, setAlerts] = useState<string[]>([]);
    const [isActive, setIsActive] = useState(false);
    const intervalRef = useRef<number | null>(null);
    const checkingRef = useRef<boolean>(false);
    const lastEmotionAlert = useRef<number>(0);
    const lastStatesRef = useRef<{ multipleFaces: boolean }>({ multipleFaces: false });
    const lastAlertAtRef = useRef<Record<string, number>>({});
    const sessionIdRef = useRef<number | null | undefined>(props?.sessionId);

    // Keep sessionIdRef updated
    useEffect(() => {
        sessionIdRef.current = props?.sessionId;
    }, [props?.sessionId]);

    const logAlert = async (type: string, description: string, confidence: number = 1.0) => {
        if (!sessionIdRef.current) return;
        try {
            await fetch('/api/proctoring/alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proctoring_session_id: sessionIdRef.current,
                    alert_type: type,
                    description,
                    confidence
                })
            });
        } catch (e) { console.error('Failed to log alert', e); }
    };

    const logEmotion = async (emotion: string, confidence: number) => {
        if (!sessionIdRef.current) return;
        try {
            await fetch('/api/proctoring/emotion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proctoring_session_id: sessionIdRef.current,
                    emotion,
                    confidence
                })
            });
        } catch (e) { console.error('Failed to log emotion', e); }
    };

    const captureFrame = async (): Promise<Blob | null> => {
        if (!videoRef.current) return null;

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) return null;

        ctx.drawImage(videoRef.current, 0, 0);

        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
        });
    };

    const drawBoundingBoxes = (boxes: Array<{
        face_id: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        emotion: string;
        emotion_conf: number;
    }>) => {
        if (!canvasRef.current || !videoRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match canvas size to video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const frameArea = canvas.width * canvas.height;
        const minArea = frameArea * 0.04;
        const kept: typeof boxes = [];
        const iou = (a: any, b: any) => {
            const ax1 = a.x1, ay1 = a.y1, ax2 = a.x2, ay2 = a.y2;
            const bx1 = b.x1, by1 = b.y1, bx2 = b.x2, by2 = b.y2;
            const ix1 = Math.max(ax1, bx1);
            const iy1 = Math.max(ay1, by1);
            const ix2 = Math.min(ax2, bx2);
            const iy2 = Math.min(ay2, by2);
            const iw = Math.max(0, ix2 - ix1);
            const ih = Math.max(0, iy2 - iy1);
            const inter = iw * ih;
            const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
            const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
            const union = areaA + areaB - inter;
            return union > 0 ? inter / union : 0;
        };
        boxes.forEach(box => {
            const area = Math.max(0, (box.x2 - box.x1)) * Math.max(0, (box.y2 - box.y1));
            if (area < minArea) return;
            if (kept.every(k => iou(k, box) <= 0.5)) kept.push(box);
        });
        kept.forEach(box => {
            // Generate consistent color per face ID
            const hue = (box.face_id * 137) % 360;
            const color = `hsl(${hue}, 70%, 50%)`;

            // Draw rectangle
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);

            // Draw label background
            const label = `ID ${box.face_id}: ${box.emotion || 'Unknown'} (${Math.round((box.emotion_conf || 0) * 100)}%)`;
            ctx.font = '14px Arial';
            const textMetrics = ctx.measureText(label);
            const textWidth = textMetrics.width;
            const textHeight = 20;

            ctx.fillStyle = color;
            ctx.fillRect(box.x1, box.y1 - textHeight - 4, textWidth + 10, textHeight + 4);

            // Draw label text
            ctx.fillStyle = 'white';
            ctx.fillText(label, box.x1 + 5, box.y1 - 8);
        });
    };

    const checkProctoring = async () => {
        if (checkingRef.current) return;
        checkingRef.current = true;
        const frame = await captureFrame();
        if (!frame) { checkingRef.current = false; return; }

        const formData = new FormData();
        formData.append('frame', frame, 'frame.jpg');

        try {
            const controller = new AbortController();
            const t = window.setTimeout(() => controller.abort(), 20000);
            let res = await fetch('/api/proctoring/analyze', { method: 'POST', body: formData, signal: controller.signal });
            if (!res.ok) {
                try {
                    res = await fetch('/proctor/analyze', { method: 'POST', body: formData, signal: controller.signal });
                } catch (_) { }
                if (!res.ok) {
                    checkingRef.current = false;
                    window.clearTimeout(t);
                    return;
                }
            }
            const ct = res.headers.get('content-type') || '';
            const text = await res.text();
            if (!ct.includes('application/json') || !text) {
                checkingRef.current = false;
                return;
            }
            const data = JSON.parse(text);

            console.log('Proctoring data:', data); // Debug log

            if (data.bounding_boxes && Array.isArray(data.bounding_boxes)) {
                drawBoundingBoxes(data.bounding_boxes);
            }

            const now = new Date().toLocaleTimeString();

            if (Array.isArray(data.bounding_boxes)) {
                const video = videoRef.current!;
                const vw = video.videoWidth || 1;
                const vh = video.videoHeight || 1;
                const frameArea = vw * vh;
                const minArea = frameArea * 0.04;
                const kept: any[] = [];
                const iou = (a: any, b: any) => {
                    const ax1 = a.x1, ay1 = a.y1, ax2 = a.x2, ay2 = a.y2;
                    const bx1 = b.x1, by1 = b.y1, bx2 = b.x2, by2 = b.y2;
                    const ix1 = Math.max(ax1, bx1);
                    const iy1 = Math.max(ay1, by1);
                    const ix2 = Math.min(ax2, bx2);
                    const iy2 = Math.min(ay2, by2);
                    const iw = Math.max(0, ix2 - ix1);
                    const ih = Math.max(0, iy2 - iy1);
                    const inter = iw * ih;
                    const areaA = Math.max(0, ax2 - ax1) * Math.max(0, ay2 - ay1);
                    const areaB = Math.max(0, bx2 - bx1) * Math.max(0, by2 - by1);
                    const union = areaA + areaB - inter;
                    return union > 0 ? inter / union : 0;
                };
                for (const b of data.bounding_boxes) {
                    const area = Math.max(0, (b.x2 - b.x1)) * Math.max(0, (b.y2 - b.y1));
                    if (area < minArea) continue;
                    if (kept.every(k => iou(k, b) <= 0.5)) kept.push(b);
                }
                if (kept.length >= 2) {
                    const key = 'multiple_faces';
                    const nowMs = Date.now();
                    const lastMs = lastAlertAtRef.current[key] || 0;
                    if (!lastStatesRef.current.multipleFaces || nowMs - lastMs > 8000) {
                        setAlerts(prev => [...prev, `${now}: ⚠️ VIOLATION: Multiple faces detected!`]);
                        props?.onViolation?.('Multiple faces detected in frame', 'critical');
                        logAlert('Multiple Faces', 'Multiple faces detected in frame', 1.0);
                        lastAlertAtRef.current[key] = nowMs;
                    }
                    lastStatesRef.current.multipleFaces = true;
                } else {
                    lastStatesRef.current.multipleFaces = false;
                }
            }

            // Emotion alerts (throttled to every 4 seconds)
            if (data.bounding_boxes && Array.isArray(data.bounding_boxes) && data.bounding_boxes.length > 0) {
                const nowTime = Date.now();
                if (nowTime - lastEmotionAlert.current > 4000) {
                    const primaryFace = data.bounding_boxes[0];
                    if (primaryFace.emotion) {
                        // Map emotions to more user-friendly terms
                        let emotionText = primaryFace.emotion;
                        if (primaryFace.emotion === 'fear' || primaryFace.emotion === 'sad') {
                            emotionText = 'concerned';
                        }
                        setAlerts(prev => [...prev, `${now}: Person is ${emotionText}`]);
                        logEmotion(primaryFace.emotion, primaryFace.emotion_conf || 0.9);
                        lastEmotionAlert.current = nowTime;
                    }
                }
            }

            if (data.face_present === false) {
                setAlerts(prev => [...prev, `${now}: No face detected`]);
            }

            // CRITICAL: Object detection (phone, book) - immediate violation
            if (Array.isArray(data.objects_detected) && data.objects_detected.length > 0) {
                const objects = data.objects_detected.map((o: any) => o.label).join(', ');
                setAlerts(prev => [...prev, `${now}: ⚠️ VIOLATION: Prohibited object detected (${objects})`]);
                props?.onViolation?.(`Prohibited object detected: ${objects}`, 'critical');
                logAlert('Prohibited Object', `Detected: ${objects}`, 0.95);
            }

            if (data.gaze_direction !== 'center') {
                const nowMs = Date.now();
                if (nowMs - (lastAlertAtRef.current['gaze'] || 0) > 5000) {
                    setAlerts(prev => [...prev, `${now}: Gaze ${data.gaze_direction}`]);
                    logAlert('Gaze Violation', `User looking ${data.gaze_direction}`, 0.8);
                    lastAlertAtRef.current['gaze'] = nowMs;
                }
            }
            if (data.mouth_moving) {
                const nowMs = Date.now();
                if (nowMs - (lastAlertAtRef.current['mouth'] || 0) > 5000) {
                    setAlerts(prev => [...prev, `${now}: Mouth movement detected`]);
                    logAlert('Mouth Movement', 'Talking or moving lips detected', 0.85);
                    lastAlertAtRef.current['mouth'] = nowMs;
                }
            }
            if (Array.isArray(data.objects_detected) && data.objects_detected.length > 0) {
                setAlerts(prev => [...prev, `${now}: Object detected (${data.objects_detected.map((o: any) => o.label).join(', ')})`]);
            }
            window.clearTimeout(t);
        } catch (err: any) {
            const msg = String(err && err.message ? err.message : err);
            if (!msg.toLowerCase().includes('abort')) {
                console.error('Proctoring check failed:', err);
            }
        } finally {
            checkingRef.current = false;
        }
    };


    const startProctoring = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsActive(true);

                intervalRef.current = window.setInterval(checkProctoring, 1500) as unknown as number;
            }
        } catch (err) {
            console.error('Failed to start proctoring:', err);
            alert('Camera access required for proctoring');
        }
    };

    const stopProctoring = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }

        if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        setIsActive(false);
    };

    useEffect(() => {
        return () => {
            stopProctoring();
        };
    }, []);

    return {
        videoRef,
        canvasRef,
        alerts,
        isActive,
        startProctoring,
        stopProctoring,
    };
};
