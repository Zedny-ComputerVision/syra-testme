import { useEffect, useRef } from 'react';
import { Box, useTheme } from '@mui/material';

interface ParticleBackgroundProps {
    interactive?: boolean;
    className?: string;
}

const ParticleBackground = ({ interactive = true, className }: ParticleBackgroundProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        let particles: Particle[] = [];
        let animationFrameId: number;

        // Mouse state
        const mouse = { x: -1000, y: -1000 };
        const CENTER_RADIUS = 250;

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            initParticles();
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        };

        class Particle {
            x: number;
            y: number;
            vx: number;
            vy: number;
            size: number;
            baseAlpha: number;
            alpha: number;

            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.5;
                this.vy = (Math.random() - 0.5) * 0.5;
                this.size = Math.random() * 2 + 1;
                this.baseAlpha = Math.random() * 0.5 + 0.1;
                this.alpha = this.baseAlpha;
            }

            update(isCenterHovered: boolean) {
                this.x += this.vx;
                this.y += this.vy;

                // Bounce off edges
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;

                // Interactive Logic (Login Specific)
                if (interactive && isCenterHovered) {
                    const dx = this.x - width / 2;
                    const dy = this.y - height / 2;
                    const distToCenter = Math.sqrt(dx * dx + dy * dy);

                    if (distToCenter < CENTER_RADIUS + 100) {
                        this.alpha = Math.max(0, this.alpha - 0.05);
                    } else {
                        if (this.alpha < this.baseAlpha) this.alpha += 0.01;
                    }

                    if (distToCenter < CENTER_RADIUS) {
                        const angle = Math.atan2(dy, dx);
                        this.x += Math.cos(angle) * 2;
                        this.y += Math.sin(angle) * 2;
                    }
                } else {
                    // Normal behavior / non-interactive mode
                    if (this.alpha < this.baseAlpha) this.alpha += 0.02;
                }
            }

            draw() {
                if (!ctx || this.alpha <= 0) return;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

                // Color based on theme
                // Dark mode: Cyan/Sky Blue (#38bdf8)
                // Light mode: Darker Blue/Slate (#0ea5e9 or #475569)
                const color = isDark ? '56, 189, 248' : '14, 165, 233'; // #38bdf8 vs #0ea5e9
                ctx.fillStyle = `rgba(${color}, ${this.alpha})`;
                ctx.fill();
            }
        }

        const initParticles = () => {
            particles = [];
            const particleCount = Math.floor((width * height) / 10000);
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            const centerX = width / 2;
            const centerY = height / 2;
            const dx = mouse.x - centerX;
            const dy = mouse.y - centerY;
            const mouseDistFromCenter = Math.sqrt(dx * dx + dy * dy);
            const isCenterHovered = mouseDistFromCenter < CENTER_RADIUS;

            particles.forEach(p => {
                p.update(isCenterHovered);
                p.draw();
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        // Initialize
        handleResize();
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [interactive, isDark]);

    return (
        <Box
            component="canvas"
            ref={canvasRef}
            className={className}
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 0,
                pointerEvents: 'none',
                bgcolor: isDark ? '#0f172a' : '#f0f9ff', // Animated transition in logic? CSS transition better
                transition: 'background-color 0.3s ease'
            }}
        />
    );
};

export default ParticleBackground;
