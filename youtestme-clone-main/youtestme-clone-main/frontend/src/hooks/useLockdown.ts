import { useState, useEffect, useCallback } from 'react';

interface LockdownOptions {
    onViolation: (type: string) => void;
    enabled: boolean;
}

export const useLockdown = ({ onViolation, enabled }: LockdownOptions) => {
    const [violation, setViolation] = useState<string | null>(null);

    const handleViolation = useCallback((type: string) => {
        if (!enabled) return;
        setViolation(type);
        onViolation(type);
    }, [enabled, onViolation]);

    useEffect(() => {
        if (!enabled) return;

        const handleBlur = () => handleViolation('Focus Lost (Alt+Tab or Window Switch)');
        const handleVisibilityChange = () => {
            if (document.hidden) handleViolation('Tab Switched or Minimized');
        };
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            handleViolation('Right Click Attempt');
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'F11' || (e.altKey && e.key === 'Tab')) {
                e.preventDefault();
                handleViolation(`Restricted Key: ${e.key}`);
            }
        };
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                handleViolation('Exited Fullscreen');
            }
        };

        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Fullscreen handled by LockdownModal on user action

        return () => {
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [enabled, handleViolation]);

    const clearViolation = () => setViolation(null);

    return {
        violation,
        clearViolation
    };
};
