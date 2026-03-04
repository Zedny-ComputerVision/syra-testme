import { useState, useEffect, useRef } from 'react';
import { Camera, Mic, Wifi, Monitor, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import clsx from 'clsx';

type CheckStatus = 'pending' | 'checking' | 'success' | 'error';

const EquipmentCheck = () => {
    const [cameraStatus, setCameraStatus] = useState<CheckStatus>('pending');
    const [micStatus, setMicStatus] = useState<CheckStatus>('pending');
    const [networkStatus, setNetworkStatus] = useState<CheckStatus>('pending');
    const [browserStatus, setBrowserStatus] = useState<CheckStatus>('pending');

    const videoRef = useRef<HTMLVideoElement>(null);

    const checkBrowser = () => {
        setBrowserStatus('checking');
        setTimeout(() => {
            // Simple check for modern browser features
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
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
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
                    setNetworkStatus('error'); // Too slow
                }
            })
            .catch(() => setNetworkStatus('error'));
    };

    useEffect(() => {
        checkBrowser();
    }, []);

    const runAllChecks = () => {
        checkCamera();
        checkMic();
        checkNetwork();
    };

    const StatusIcon = ({ status }: { status: CheckStatus }) => {
        if (status === 'checking') return <Loader2 className="animate-spin text-primary-500" size={24} />;
        if (status === 'success') return <CheckCircle2 className="text-success" size={24} />;
        if (status === 'error') return <XCircle className="text-danger" size={24} />;
        return <div className="w-6 h-6 rounded-full border-2 border-slate-200"></div>;
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">System Compatibility Check</h1>
                <p className="text-slate-500 mt-1">Ensure your device meets the requirements for the examination.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Camera Check */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <Camera size={24} />
                            </div>
                            <h3 className="font-semibold text-slate-800">Webcam Check</h3>
                        </div>
                        <StatusIcon status={cameraStatus} />
                    </div>
                    <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        {cameraStatus === 'pending' && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                Camera preview will appear here
                            </div>
                        )}
                    </div>
                    <button
                        onClick={checkCamera}
                        className="mt-4 w-full py-2 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Test Camera
                    </button>
                </div>

                {/* Mic Check */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <Mic size={24} />
                            </div>
                            <h3 className="font-semibold text-slate-800">Microphone Check</h3>
                        </div>
                        <StatusIcon status={micStatus} />
                    </div>
                    <div className="h-32 bg-slate-50 rounded-xl flex items-center justify-center">
                        <div className="flex gap-1 items-end h-16">
                            {[...Array(10)].map((_, i) => (
                                <div
                                    key={i}
                                    className={clsx(
                                        "w-2 rounded-full transition-all duration-100",
                                        micStatus === 'success' ? "bg-success animate-pulse" : "bg-slate-200"
                                    )}
                                    style={{ height: micStatus === 'success' ? `${Math.random() * 100}%` : '20%' }}
                                ></div>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={checkMic}
                        className="mt-4 w-full py-2 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Test Microphone
                    </button>
                </div>

                {/* Network Check */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <Wifi size={24} />
                            </div>
                            <h3 className="font-semibold text-slate-800">Network Speed</h3>
                        </div>
                        <StatusIcon status={networkStatus} />
                    </div>
                    <div className="text-center py-8">
                        <div className="text-3xl font-bold text-slate-800">
                            {networkStatus === 'success' ? 'Good' : networkStatus === 'checking' ? 'Checking...' : '--'}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">Connection Stability</div>
                    </div>
                    <button
                        onClick={checkNetwork}
                        className="mt-4 w-full py-2 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Test Network
                    </button>
                </div>

                {/* Browser Check */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                <Monitor size={24} />
                            </div>
                            <h3 className="font-semibold text-slate-800">Browser Compatibility</h3>
                        </div>
                        <StatusIcon status={browserStatus} />
                    </div>
                    <div className="space-y-3 mt-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Browser</span>
                            <span className="font-medium text-slate-700">Chrome / Safari</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">Version</span>
                            <span className="font-medium text-slate-700">Latest</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-500">JavaScript</span>
                            <span className="font-medium text-success">Enabled</span>
                        </div>
                    </div>
                    <button
                        onClick={checkBrowser}
                        className="mt-4 w-full py-2 border border-slate-200 rounded-lg font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Re-check Browser
                    </button>
                </div>
            </div>

            <div className="flex justify-end pt-6 border-t border-slate-200">
                <button
                    onClick={runAllChecks}
                    className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-xl font-medium transition-colors shadow-lg shadow-primary-900/20"
                >
                    Run All Checks
                </button>
            </div>
        </div>
    );
};

export default EquipmentCheck;
