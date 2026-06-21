import { useEffect, useRef } from 'react';

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ffcc00', '#e91e63'];

export default function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height * 0.5,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rot: Math.random() * 360,
      vx: -2 + Math.random() * 4,
      vy: 2 + Math.random() * 5,
      vr: -4 + Math.random() * 8,
    }));

    let running = true;
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
      }
      requestAnimationFrame(draw);
    }
    draw();
    return () => { running = false; };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999 }}
    />
  );
}
