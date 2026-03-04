import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import clsx from 'clsx';

interface TimerProps {
    durationMinutes: number;
    onTimeUp: () => void;
}

const Timer = ({ durationMinutes, onTimeUp }: TimerProps) => {
    const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [onTimeUp]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isLowTime = timeLeft < 300; // Less than 5 mins

    return (
        <div className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold text-lg transition-colors",
            isLowTime ? "bg-danger/10 text-danger" : "bg-slate-100 text-slate-700"
        )}>
            <Clock size={20} />
            <span>{formatTime(timeLeft)}</span>
        </div>
    );
};

export default Timer;
