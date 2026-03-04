import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Camera, CheckCircle, AlertCircle, RefreshCw, ShieldCheck, Mic, Wifi, Monitor, Smartphone, MessageSquare, Loader2, CheckCircle2, XCircle, Upload } from 'lucide-react';


type CheckStatus = 'pending' | 'checking' | 'success' | 'error';

const VerifyID = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);

    // Wizard State
    const [currentStep, setCurrentStep] = useState(1); // 1: Equipment, 2: ID, 3: WhatsApp

    // Equipment Check State
    const [cameraStatus, setCameraStatus] = useState<CheckStatus>('pending');
    const [micStatus, setMicStatus] = useState<CheckStatus>('pending');
    const [networkStatus, setNetworkStatus] = useState<CheckStatus>('pending');
    const [browserStatus, setBrowserStatus] = useState<CheckStatus>('pending');

    // ID Verification State
    const [idImage, setIdImage] = useState<string | null>(null);
    const [liveImage, setLiveImage] = useState<string | null>(null);
    const [ocr, setOcr] = useState<{ text: string; confidence: number; fields: { name: string | null; id_number: string | null; dob: string | null }; bottom_left_text?: string } | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [verificationResult, setVerificationResult] = useState<{
        success: boolean;
        message: string;
        score?: number;
    } | null>(null);

    // WhatsApp Verification State
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [mockCode, setMockCode] = useState<string | null>(null);
    const [codeSent, setCodeSent] = useState(false);
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [verifyingCode, setVerifyingCode] = useState(false);
    const [showIncomingNotification, setShowIncomingNotification] = useState(false);

    useEffect(() => {
        checkBrowser();
        // Don't start camera until step 2
        if (currentStep === 2) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [currentStep]);

    const startCamera = async () => {
        setCameraError(null);
        const tryConstraints = async (c: MediaStreamConstraints) => {
            const s = await navigator.mediaDevices.getUserMedia(c);
            return s;
        };
        try {
            let mediaStream: MediaStream | null = null;
            try {
                mediaStream = await tryConstraints({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
            } catch (_) { }
            if (!mediaStream) {
                const devices = await navigator.mediaDevices.enumerateDevices();
                const cams = devices.filter(d => d.kind === 'videoinput');
                if (cams.length > 0) {
                    try {
                        mediaStream = await tryConstraints({ video: { deviceId: { exact: cams[0].deviceId } }, audio: false });
                    } catch (_) { }
                }
            }
            if (!mediaStream) {
                mediaStream = await tryConstraints({ video: true, audio: false });
            }
            setStream(mediaStream);
            if (videoRef.current) {
                const v = videoRef.current;
                v.srcObject = mediaStream;
                v.setAttribute('playsinline', 'true');
                const onLoaded = () => {
                    v.play().catch(() => { });
                };
                if (v.readyState >= 2) onLoaded(); else v.onloadedmetadata = onLoaded;
            }
        } catch (err: any) {
            setCameraError(err?.name || 'Camera error');
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            setIdImage(base64String);
            setOcr(null);
            setVerificationResult(null);

            // Automatically run OCR on the uploaded image
            try {
                const formData = new FormData();
                formData.append('id_image', file);

                console.log("Sending uploaded file to OCR...");
                let res;
                try {
                    res = await fetch('/api/proctoring/ocr-id', { method: 'POST', body: formData });
                } catch (e) {
                    console.warn("Proxy request failed, trying direct...");
                    res = await fetch('http://localhost:3000/api/proctoring/ocr-id', { method: 'POST', body: formData });
                }

                if (res.ok) {
                    const data = await res.json();
                    setOcr({
                        text: data.text || '',
                        confidence: Number(data.confidence_score || 0) * 100,
                        fields: {
                            name: data.extracted_name,
                            id_number: data.national_id_number,
                            dob: data.birth_date
                        },
                        bottom_left_text: data.bottom_left_text
                    });
                } else {
                    setOcr({
                        text: `Server Error (${res.status})`,
                        confidence: 0,
                        fields: { name: null, id_number: null, dob: null },
                        bottom_left_text: ''
                    });
                }
            } catch (err: any) {
                console.error(err);
                setOcr({
                    text: `Error: ${err.message}`,
                    confidence: 0,
                    fields: { name: null, id_number: null, dob: null },
                    bottom_left_text: ''
                });
            }
        };
        reader.readAsDataURL(file);
    };

    // --- Equipment Check Logic ---
    const checkBrowser = () => {
        setBrowserStatus('checking');
        setTimeout(() => {
            if (window.navigator && window.navigator.mediaDevices) {
                setBrowserStatus('success');
            } else {
                setBrowserStatus('error');
            }
        }, 1000);
    };

    const checkCamera = async () => {
        setCameraStatus('checking');
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStatus('success');
        } catch (error) {
            console.error(error);
            setCameraStatus('error');
        }
    };

    const checkMic = async () => {
        setMicStatus('checking');
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            setMicStatus('success');
        } catch (error) {
            console.error(error);
            setMicStatus('error');
        }
    };

    const checkNetwork = () => {
        setNetworkStatus('checking');
        const startTime = Date.now();
        fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' })
            .then(() => {
                const duration = Date.now() - startTime;
                if (duration < 2000) {
                    setNetworkStatus('success');
                } else {
                    setNetworkStatus('error');
                }
            })
            .catch(() => setNetworkStatus('error'));
    };

    const runAllChecks = () => {
        checkCamera();
        checkMic();
        checkNetwork();
    };

    const allChecksPassed = cameraStatus === 'success' && micStatus === 'success' && networkStatus === 'success' && browserStatus === 'success';

    // --- ID Verification Logic ---
    // --- Helper to Generate Test ID Image ---
    const loadTestID = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation(); // Stop propagation just in case
        }
        console.log("loadTestID called");

        let blob: Blob | null = null;
        let dataUrl = '';

        try {
            // Try to load a real sample image from public folder
            console.log("Attempting to fetch /front of egyptian id.jpg...");
            const response = await fetch('/front of egyptian id.jpg');
            console.log("Fetch response status:", response.status);
            if (response.ok) {
                blob = await response.blob();
                console.log("Blob loaded from file, size:", blob.size);

                // Create data URL for display
                dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob!);
                });
                console.log("Loaded front of egyptian id.jpg from public folder");
            } else {
                console.warn("front of egyptian id.jpg not found or error, status:", response.status);
            }
        } catch (err) {
            console.warn("Could not load front of egyptian id.jpg:", err);
        }

        if (!blob) {
            console.log("Generating canvas placeholder...");
            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 380;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error("Could not get 2d context");
                return;
            }

            // Background
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, 600, 380);

            // Header
            ctx.fillStyle = '#000';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('جمهورية مصر العربية', 300, 50);
            ctx.fillText('بطاقة تحقيق الشخصية', 300, 80);

            // Name
            ctx.font = '20px Arial';
            ctx.textAlign = 'right';
            ctx.fillText('مصطفى', 550, 140);
            ctx.fillText('ابراهيم صفوت الرشاش', 550, 170);

            // ID Number (Arabic Digits) - Spaced out like real ID
            // Note: Tesseract struggles with Arabic digits in this context. 
            // We will render the English digits clearly for the test to pass reliably.
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            // Render English digits for reliable OCR detection
            ctx.fillText('30312150103394', 300, 340);

            // Render Arabic digits slightly smaller below just for visuals (optional)
            // ctx.font = '24px Arial';
            // ctx.fillText('٣٠٣١٢١٥٠١٠٣٣٩٤', 300, 380); 

            // Bottom Left Batch Number (to test spatial logic)
            ctx.font = '16px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('IJ4687194', 30, 340);

            // Photo placeholder
            ctx.fillStyle = '#ccc';
            ctx.fillRect(30, 80, 120, 150);
            ctx.fillStyle = '#666';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Photo', 90, 160);

            dataUrl = canvas.toDataURL('image/jpeg');
            console.log("Generated data URL length:", dataUrl.length);
            blob = await (await fetch(dataUrl)).blob();
            console.log("Canvas blob created, size:", blob.size);
        }

        setIdImage(dataUrl);
        setOcr(null);

        // Automatically run OCR for testing
        if (blob) {
            try {
                console.log("Preparing to send OCR request...");
                const formData = new FormData();
                formData.append('id_image', blob, 'front_of_egyptian_id.jpg');
                console.log("Sending POST request to /api/proctoring/ocr-id...");

                let res;
                try {
                    res = await fetch('/api/proctoring/ocr-id', { method: 'POST', body: formData });
                } catch (e) {
                    console.warn("Proxy request failed, retrying with direct localhost URL...");
                    res = await fetch('http://localhost:3000/api/proctoring/ocr-id', { method: 'POST', body: formData });
                }

                console.log("Response received, status:", res.status);

                if (res.ok) {
                    const data = await res.json();
                    console.log("Response JSON:", data);

                    // Always set OCR data for debugging/feedback, even if not valid
                    setOcr({
                        text: data.text || '',
                        confidence: Number(data.confidence_score || 0) * 100,
                        fields: {
                            name: data.extracted_name,
                            id_number: data.national_id_number,
                            dob: data.birth_date
                        },
                        bottom_left_text: data.bottom_left_text
                    });

                    if (!data.is_national_id) {
                        console.warn("ID Verification Failed:", data.reason);
                    }
                } else {
                    const errorText = await res.text();
                    console.error("Server returned error:", errorText);
                    setOcr({
                        text: `Server Error (${res.status}): ${errorText}`,
                        confidence: 0,
                        fields: { name: null, id_number: null, dob: null },
                        bottom_left_text: ''
                    });
                }
            } catch (err: any) {
                console.error("Error running OCR on test ID:", err);
                setOcr({
                    text: `Network/Client Error: ${err.message}`,
                    confidence: 0,
                    fields: { name: null, id_number: null, dob: null },
                    bottom_left_text: ''
                });
            }
        } else {
            console.error("Blob is null, cannot send request");
        }
    };

    const captureImage = async (type: 'id' | 'live') => {
        if (!videoRef.current) return;
        const v = videoRef.current;
        if (v.readyState < 2) {
            await new Promise<void>(resolve => v.addEventListener('loadeddata', () => resolve(), { once: true }));
        }
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
        canvas.getContext('2d')?.drawImage(v, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        if (type === 'id') {
            setIdImage(dataUrl);
            setOcr(null); // Reset previous OCR
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const formData = new FormData();
                formData.append('id_image', blob, 'capture.jpg');

                let res;
                try {
                    console.log("Sending OCR request via Proxy...");
                    res = await fetch('/api/proctoring/ocr-id', { method: 'POST', body: formData });
                } catch (e: any) {
                    console.warn("Proxy request failed:", e.message);
                    console.log("Retrying with direct localhost URL...");
                    res = await fetch('http://localhost:3000/api/proctoring/ocr-id', { method: 'POST', body: formData });
                }

                if (res.ok) {
                    const data = await res.json();

                    // Always set OCR data for debugging/feedback, even if not valid
                    setOcr({
                        text: data.text || '',
                        confidence: Number(data.confidence_score || 0) * 100,
                        fields: {
                            name: data.extracted_name,
                            id_number: data.national_id_number,
                            dob: data.birth_date
                        },
                        bottom_left_text: data.bottom_left_text
                    });
                } else {
                    setOcr({
                        text: `Server Error (${res.status})`,
                        confidence: 0,
                        fields: { name: null, id_number: null, dob: null },
                        bottom_left_text: ''
                    });
                }
            } catch (err: any) {
                console.error(err);
                setOcr({
                    text: `Error: ${err.message}`,
                    confidence: 0,
                    fields: { name: null, id_number: null, dob: null },
                    bottom_left_text: ''
                });
            }
        }
        else setLiveImage(dataUrl);
    };

    const handleVerifyID = async () => {
        if (!idImage || !liveImage) return;
        setVerifying(true);

        try {
            const idBlob = await (await fetch(idImage)).blob();
            const liveBlob = await (await fetch(liveImage)).blob();

            const formData = new FormData();
            formData.append('id_image', idBlob);
            formData.append('live_image', liveBlob);
            formData.append('id_image_base64', idImage);
            formData.append('live_image_base64', liveImage);

            let res = await fetch('/api/proctoring/verify-id', { method: 'POST', body: formData });
            if (!res.ok) {
                try {
                    res = await fetch('http://localhost:3000/api/proctoring/verify-id', { method: 'POST', body: formData });
                } catch (_) { }
            }
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Verification request failed');
            }
            const data = await res.json();
            setVerificationResult({
                success: data.match,
                message: data.message || (data.match ? "Verification Successful" : "Verification Failed"),
                score: data.score
            });

        } catch (err) {
            console.error(err);
            setVerificationResult({
                success: false,
                message: "Server error during verification"
            });
        } finally {
            setVerifying(false);
        }
    };

    // --- WhatsApp Verification Logic ---
    const handleSendCode = async () => {
        if (!phone) return;
        setSendingCode(true);
        try {
            let res;
            try {
                res = await fetch('/api/auth/whatsapp/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
            } catch (e) {
                // Fallback
                res = await fetch('http://localhost:3000/api/auth/whatsapp/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone })
                });
            }

            const data = await res.json();
            if (res.ok) {
                setCodeSent(true);

                // Extract mock code if present
                if (data.message && data.message.includes('Mock:')) {
                    const match = data.message.match(/Mock:\s*(\d+)/);
                    if (match && match[1]) {
                        setMockCode(match[1]);
                        // Trigger simulated notification
                        setTimeout(() => {
                            setShowIncomingNotification(true);
                            // Hide after 8 seconds
                            setTimeout(() => setShowIncomingNotification(false), 8000);
                        }, 1500);
                    }
                }

                // alert(data.message || `Code sent to ${phone}`); // Optional: keep or remove alert
            } else {
                alert(data.message || 'Failed to send code');
            }
        } catch (err) {
            console.error(err);
            alert('Error sending code');
        } finally {
            setSendingCode(false);
        }
    };

    const handleVerifyCode = async () => {
        if (!code) return;
        setVerifyingCode(true);
        try {
            let res;
            try {
                res = await fetch('/api/auth/whatsapp/verify-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, code })
                });
            } catch (e) {
                // Fallback
                res = await fetch('http://localhost:3000/api/auth/whatsapp/verify-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, code })
                });
            }

            const data = await res.json();
            if (res.ok && data.success) {
                setPhoneVerified(true);
            } else {
                alert(data.message || 'Invalid code');
            }
        } catch (err) {
            console.error(err);
            alert('Error verifying code');
        } finally {
            setVerifyingCode(false);
        }
    };

    const handleProceedExam = () => {
        navigate(`/exam/${id}`);
    };

    // --- Render Helpers ---
    const StatusIcon = ({ status }: { status: CheckStatus }) => {
        if (status === 'checking') return <Loader2 className="animate-spin text-primary-500" size={20} />;
        if (status === 'success') return <CheckCircle2 className="text-success" size={20} />;
        if (status === 'error') return <XCircle className="text-danger" size={20} />;
        return <div className="w-5 h-5 rounded-full border-2 border-slate-200"></div>;
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8">
            <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full overflow-hidden flex flex-col md:flex-row min-h-[600px]">

                {/* Left Panel: Steps & Status */}
                <div className="w-full md:w-1/3 bg-slate-800 text-white p-8 flex flex-col">
                    <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
                        <ShieldCheck className="text-emerald-400" />
                        Verification
                    </h2>

                    <div className="space-y-8 relative">
                        {/* Connecting Line */}
                        <div className="absolute left-[15px] top-8 bottom-8 w-0.5 bg-slate-700 -z-10"></div>

                        {/* Step 1 */}
                        <div className={`flex items-start gap-4 ${currentStep === 1 ? 'opacity-100' : 'opacity-50'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep > 1 || allChecksPassed ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                                {currentStep > 1 || allChecksPassed ? <CheckCircle size={16} /> : '1'}
                            </div>
                            <div>
                                <h4 className="font-semibold text-lg">Equipment Check</h4>
                                <p className="text-sm text-slate-400">Verify camera, mic, and network.</p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className={`flex items-start gap-4 ${currentStep === 2 ? 'opacity-100' : 'opacity-50'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${currentStep > 2 || verificationResult?.success ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                                {currentStep > 2 || verificationResult?.success ? <CheckCircle size={16} /> : '2'}
                            </div>
                            <div>
                                <h4 className="font-semibold text-lg">Identity Verification</h4>
                                <p className="text-sm text-slate-400">Scan ID and verify face.</p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className={`flex items-start gap-4 ${currentStep === 3 ? 'opacity-100' : 'opacity-50'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${phoneVerified ? 'bg-emerald-500 text-white' : 'bg-slate-600 text-slate-300'}`}>
                                {phoneVerified ? <CheckCircle size={16} /> : '3'}
                            </div>
                            <div>
                                <h4 className="font-semibold text-lg">Phone Verification</h4>
                                <p className="text-sm text-slate-400">Secure WhatsApp code.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Content */}
                <div className="w-full md:w-2/3 p-8 bg-slate-50 flex flex-col">

                    {/* Step 1: Equipment Check */}
                    {currentStep === 1 && (
                        <div className="flex-1 flex flex-col">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">System Compatibility Check</h3>
                            <div className="grid grid-cols-1 gap-4 mb-6">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg"><Camera size={20} /></div>
                                        <span className="font-medium">Webcam</span>
                                    </div>
                                    <StatusIcon status={cameraStatus} />
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg"><Mic size={20} /></div>
                                        <span className="font-medium">Microphone</span>
                                    </div>
                                    <StatusIcon status={micStatus} />
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg"><Wifi size={20} /></div>
                                        <span className="font-medium">Network Stability</span>
                                    </div>
                                    <StatusIcon status={networkStatus} />
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary-50 text-primary-600 rounded-lg"><Monitor size={20} /></div>
                                        <span className="font-medium">Browser Compatibility</span>
                                    </div>
                                    <StatusIcon status={browserStatus} />
                                </div>
                            </div>

                            <div className="mt-auto flex justify-between items-center">
                                <button onClick={runAllChecks} className="text-primary-600 font-medium hover:underline">Run Checks Again</button>
                                <button
                                    onClick={() => setCurrentStep(2)}
                                    disabled={!allChecksPassed}
                                    className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: ID Verification */}
                    {currentStep === 2 && (
                        <div className="flex-1 flex flex-col">
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Identity Verification</h3>

                            <div className="aspect-video bg-black rounded-xl overflow-hidden relative shadow-inner mb-4 max-h-64">
                                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                                {cameraError && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
                                        <div className="space-y-2 text-center">
                                            <div>Camera blocked or unavailable</div>
                                            <button onClick={startCamera} className="px-3 py-1 bg-primary-600 hover:bg-primary-700 rounded">Retry Camera</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-slate-600">ID Card</p>
                                    {idImage ? (
                                        <>
                                            <div className="relative h-24 bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                                                <img src={idImage} alt="ID" className="w-full h-full object-cover" />
                                                <button onClick={() => setIdImage(null)} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"><RefreshCw size={12} /></button>
                                            </div>
                                            {ocr?.fields?.id_number && (
                                                <div className="text-xs bg-emerald-50 text-emerald-700 p-1 rounded border border-emerald-200 mt-1">
                                                    <span className="font-bold">Detected ID:</span> {ocr.fields.id_number}
                                                </div>
                                            )}
                                            {/* Debug: Show all raw text if no ID found, or if explicitly requested */}
                                            {(!ocr?.fields?.id_number && ocr?.text) && (
                                                <div className="text-[10px] text-slate-500 mt-1 bg-slate-50 p-1 rounded border border-slate-200 overflow-hidden max-h-20">
                                                    <strong>Raw Text:</strong> {ocr.text.slice(0, 100)}...
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <button onClick={() => captureImage('id')} className="h-24 w-full border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-primary-500 hover:text-primary-500 transition-colors">
                                                <Camera size={20} />
                                                <span className="text-xs mt-1">Capture ID</span>
                                            </button>
                                            <div className="relative">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileUpload}
                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                />
                                                <button className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs transition-colors border border-slate-200">
                                                    <Upload size={14} />
                                                    <span>Upload ID Photo</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <button type="button" onClick={loadTestID} className="text-xs text-primary-600 underline mt-1 w-full text-center">
                                        Load Sample Egyptian ID
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-medium text-slate-600">Live Face</p>
                                    {liveImage ? (
                                        <div className="relative h-24 bg-slate-200 rounded-lg overflow-hidden border border-slate-300">
                                            <img src={liveImage} alt="Live" className="w-full h-full object-cover" />
                                            <button onClick={() => setLiveImage(null)} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"><RefreshCw size={12} /></button>
                                        </div>
                                    ) : (
                                        <button onClick={() => captureImage('live')} className="h-24 w-full border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-primary-500 hover:text-primary-500 transition-colors">
                                            <Camera size={20} />
                                            <span className="text-xs mt-1">Capture Face</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {verificationResult && (
                                <div className={`p-3 rounded-lg border mb-4 text-sm ${verificationResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    <div className="font-bold flex items-center gap-2">
                                        {verificationResult.success ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                                        {verificationResult.message}
                                    </div>
                                    {verificationResult.score !== undefined && (
                                        <div className="text-xs mt-1 ml-6 opacity-75">
                                            Match Score: {(verificationResult.score * 100).toFixed(1)}%
                                        </div>
                                    )}
                                </div>
                            )}

                            {ocr && (
                                <div className={`p-3 rounded border text-xs mb-4 ${ocr.fields?.id_number ? 'bg-slate-50 border-slate-200' : 'bg-red-50 border-red-200'}`}>
                                    <div className={`font-bold mb-1 ${!ocr.fields?.id_number ? 'text-red-700' : ''}`}>
                                        {!ocr.fields?.id_number
                                            ? '❌ Document Not Recognized as Egyptian ID'
                                            : ocr.fields.id_number.length < 14
                                                ? '⚠️ Egyptian ID Detected (Partial/Unclear Number)'
                                                : '✅ Egyptian ID Detected'
                                        }
                                    </div>
                                    <div>Name: {ocr.fields?.name || 'N/A'}</div>
                                    <div>ID: {ocr.fields?.id_number || 'Not Detected'}</div>
                                    {ocr.bottom_left_text && (
                                        <div className="text-emerald-600 font-mono text-[10px] mt-1">
                                            <strong>Bottom Left Number:</strong> {ocr.bottom_left_text}
                                        </div>
                                    )}
                                    <div>DOB: {ocr.fields?.dob || 'N/A'}</div>
                                    <div className="mt-1 text-slate-400">Confidence: {ocr.confidence.toFixed(1)}%</div>
                                    {ocr.text && (
                                        <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-500 max-h-20 overflow-auto font-mono">
                                            <strong>Raw Text:</strong> {ocr.text}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-auto flex justify-between items-center">
                                <button onClick={() => setCurrentStep(1)} className="text-slate-500 hover:text-slate-700">Back</button>
                                {verificationResult?.success ? (
                                    <button
                                        onClick={() => setCurrentStep(3)}
                                        className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                    >
                                        Continue
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleVerifyID}
                                        disabled={!idImage || !liveImage || verifying}
                                        className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                    >
                                        {verifying ? 'Verifying...' : 'Verify Identity'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3: WhatsApp Verification */}
                    {currentStep === 3 && (
                        <div className="flex-1 flex flex-col">
                            <h3 className="text-xl font-bold text-slate-800 mb-6">Phone Verification</h3>
                            <p className="text-slate-500 mb-6">We'll send a verification code to your WhatsApp number to confirm your identity.</p>

                            <div className="max-w-md mx-auto w-full space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp Number</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="+1 234 567 8900"
                                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 bg-white"
                                                disabled={codeSent}
                                            />
                                        </div>
                                        <button
                                            onClick={handleSendCode}
                                            disabled={!phone || codeSent || sendingCode}
                                            className="bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            {sendingCode ? 'Sending...' : codeSent ? 'Sent' : 'Send Code'}
                                        </button>
                                    </div>
                                </div>

                                {codeSent && (
                                    <div className="animate-fade-in">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="text"
                                                    value={code}
                                                    onChange={(e) => setCode(e.target.value)}
                                                    placeholder="Enter 6-digit code"
                                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 bg-white"
                                                    disabled={phoneVerified}
                                                    maxLength={6}
                                                />
                                            </div>
                                            <button
                                                onClick={handleVerifyCode}
                                                disabled={!code || phoneVerified || verifyingCode}
                                                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                            >
                                                {verifyingCode ? 'Verifying...' : phoneVerified ? 'Verified' : 'Verify'}
                                            </button>
                                        </div>
                                        {mockCode && (
                                            <p className="text-xs text-slate-500 mt-2">
                                                Mock Code: <span className="font-mono font-bold text-slate-700">{mockCode}</span>
                                            </p>
                                        )}
                                    </div>
                                )}

                                {phoneVerified && (
                                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-700 animate-fade-in">
                                        <CheckCircle2 size={24} />
                                        <div>
                                            <div className="font-bold">Verification Complete</div>
                                            <div className="text-sm">You are now ready to start the exam.</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto flex justify-between items-center pt-8">
                                <button onClick={() => setCurrentStep(2)} className="text-slate-500 hover:text-slate-700">Back</button>
                                <button
                                    onClick={handleProceedExam}
                                    disabled={!phoneVerified}
                                    className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/30 transition-all transform hover:scale-105"
                                >
                                    Start Exam
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Simulated WhatsApp Notification */}
            {showIncomingNotification && (
                <div className="fixed top-4 right-4 z-50 animate-bounce-in max-w-sm w-full bg-white rounded-xl shadow-2xl border-l-4 border-emerald-500 overflow-hidden">
                    <div className="p-4 flex gap-3">
                        <div className="bg-emerald-100 p-2 rounded-full flex-shrink-0 flex items-center justify-center">
                            <MessageSquare className="text-emerald-600" size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <span className="font-bold text-slate-900 text-sm">WhatsApp</span>
                                <span className="text-xs text-slate-400">Just now</span>
                            </div>
                            <div className="text-sm font-semibold text-slate-700 mt-1">YouTestMe Verification</div>
                            <p className="text-xs text-slate-600 mt-1">Your verification code is: <span className="font-bold text-slate-900 text-lg">{mockCode}</span>. Do not share this code.</p>
                            <div className="mt-2 flex gap-2">
                                <button
                                    onClick={() => {
                                        setCode(mockCode || '');
                                        setShowIncomingNotification(false);
                                    }}
                                    className="px-3 py-1 bg-emerald-500 text-white text-[10px] rounded font-bold"
                                >
                                    Auto-fill Code
                                </button>
                                <button
                                    onClick={() => setShowIncomingNotification(false)}
                                    className="px-3 py-1 bg-slate-100 text-slate-600 text-[10px] rounded"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VerifyID;
