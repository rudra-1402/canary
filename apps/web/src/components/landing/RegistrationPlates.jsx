import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

// The registration mechanism, built as a real canvas, not a static graphic.
// Three plates (Cobalt, Vermilion, Canary) drift apart at rest and pull into
// exact alignment as the cursor approaches — "independent evidence moving
// into alignment and revealing a shared result" (build contract §1), which is
// also literally what TrustScore does: two parties' independent records
// converge on one number. Reduced-motion collapses straight to the
// registered end-state, no travel.

const PLATE_COLORS = ['#1E5BFF', '#FF4A24', '#FFD100'];

export default function RegistrationPlates({ className = '' }) {
  const canvasRef = useRef(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    function handlePointerMove(event) {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
        active: true,
      };
    }
    function handlePointerLeave() {
      pointerRef.current.active = false;
    }
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    let raf = 0;
    // Plate offsets relative to the shared center, in units of min(width,height).
    const rest = [
      { dx: -0.16, dy: -0.06, rot: -6 },
      { dx: 0.17, dy: 0.05, rot: 5 },
      { dx: -0.02, dy: 0.14, rot: -3 },
    ];
    const current = rest.map((r) => ({ ...r }));

    function draw() {
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height);
      const { x: px, y: py, active } = pointerRef.current;

      // Proximity to center (0..1) drives registration: near center = aligned.
      const dist = active ? Math.hypot(px - 0.5, py - 0.5) : 0.5;
      const registration = prefersReduced ? 1 : Math.max(0, 1 - dist / 0.42);

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < 3; i += 1) {
        const target = {
          dx: rest[i].dx * (1 - registration),
          dy: rest[i].dy * (1 - registration),
          rot: rest[i].rot * (1 - registration),
        };
        const ease = prefersReduced ? 1 : 0.08;
        current[i].dx += (target.dx - current[i].dx) * ease;
        current[i].dy += (target.dy - current[i].dy) * ease;
        current[i].rot += (target.rot - current[i].rot) * ease;

        const size = scale * 0.34;
        const x = cx + current[i].dx * scale;
        const y = cy + current[i].dy * scale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((current[i].rot * Math.PI) / 180);
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = PLATE_COLORS[i];

        if (i < 2) {
          // Cobalt / Vermilion: rounded rectangle plates.
          const w = size;
          const h = size * 0.62;
          const r = size * 0.08;
          ctx.beginPath();
          ctx.moveTo(-w / 2 + r, -h / 2);
          ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
          ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
          ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
          ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
          ctx.closePath();
          ctx.fill();
        } else {
          // Canary: the registration point, a circle.
          ctx.beginPath();
          ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Registration crosshair — only fully visible once plates align.
      ctx.globalAlpha = 0.5 * registration;
      ctx.strokeStyle = '#0B0F14';
      ctx.lineWidth = 1;
      const armLen = scale * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx - armLen, cy);
      ctx.lineTo(cx + armLen, cy);
      ctx.moveTo(cx, cy - armLen);
      ctx.lineTo(cx, cy + armLen);
      ctx.stroke();
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Three colored plates that align into registration as the cursor approaches the center, representing two parties' independent records converging on one TrustScore."
      className={className}
    />
  );
}

RegistrationPlates.propTypes = {
  className: PropTypes.string,
};
