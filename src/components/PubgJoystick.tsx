import React, { useRef, useState } from 'react';

interface PubgJoystickProps {
  scale?: number;
  disabled?: boolean;
  onVectorChange: (x: number, y: number) => void;
}

export const PubgJoystick: React.FC<PubgJoystickProps> = ({
  scale = 1,
  disabled = false,
  onVectorChange,
}) => {
  const baseRadius = 54;
  const knobMax = 36;
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const renderedScale = useRef(1);
  const updateFromClient = (clientX: number, clientY: number) => {
    const dx = (clientX - centerRef.current.x) / renderedScale.current;
    const dy = (clientY - centerRef.current.y) / renderedScale.current;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(knobMax, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0.001 ? Math.cos(angle) * clamped : 0;
    const ky = dist > 0.001 ? Math.sin(angle) * clamped : 0;
    setKnob({ x: kx, y: ky });

    const normX = Number((kx / knobMax).toFixed(3));
    const normY = Number((-ky / knobMax).toFixed(3));
    onVectorChange(normX, normY);
  };

  const reset = () => {
    pointerIdRef.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    onVectorChange(0, 0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    renderedScale.current = rect.width / (baseRadius * 2) || 1;
    centerRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    pointerIdRef.current = e.pointerId;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || pointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateFromClient(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    reset();
  };

  return (
    <div
      data-testid="hud-joystick"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        width: baseRadius * 2,
        height: baseRadius * 2,
        transform: `scale(${scale})`,
      }}
      className={`relative rounded-full border-2 touch-none select-none flex items-center justify-center transition-colors ${
        active
          ? 'bg-[#101829]/85 border-amber-400/90 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
          : 'bg-[#0b101b]/75 border-amber-600/55 shadow-xl'
      } ${disabled ? 'opacity-65 pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <div className="pointer-events-none absolute inset-3 rounded-full border border-slate-500/35" />
      <div
        style={{
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
        className={`pointer-events-none w-11 h-11 rounded-full border-2 shadow-lg transition-transform duration-75 ${
          active
            ? 'bg-gradient-to-b from-amber-300 to-amber-600 border-amber-100'
            : 'bg-gradient-to-b from-slate-600 to-slate-800 border-amber-400/80'
        }`}
      />
    </div>
  );
};
