import { useState } from 'react';
import PropTypes from 'prop-types';

// Chromatic Registration Press (build contract §14): fill goes transparent on
// press, three peripheral plates shift outward from behind the label, then
// snap back. Reads as printing-plate misregistration, not an RGB glitch —
// the plates move, the label stays sharp throughout.
export default function RegistrationPressButton({
  as: Component = 'button',
  children,
  className = '',
  ...props
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Component
      {...props}
      onPointerDown={(event) => {
        setPressed(true);
        props.onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setPressed(false);
        props.onPointerUp?.(event);
      }}
      onPointerLeave={(event) => {
        setPressed(false);
        props.onPointerLeave?.(event);
      }}
      className={`registration-press group relative inline-flex items-center justify-center overflow-hidden rounded-full px-7 py-3 text-sm font-semibold transition-colors duration-150 ${
        pressed ? 'bg-transparent text-foreground' : 'bg-foreground text-card'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className="registration-plate pointer-events-none absolute inset-0 rounded-full bg-[#1E5BFF] mix-blend-multiply transition-transform duration-150 motion-reduce:transition-none"
        style={{
          transform: pressed ? 'translateX(-6px)' : 'translateX(0)',
          opacity: pressed ? 0.55 : 0,
        }}
      />
      <span
        aria-hidden="true"
        className="registration-plate pointer-events-none absolute inset-0 rounded-full bg-[#FF4A24] mix-blend-multiply transition-transform duration-150 motion-reduce:transition-none"
        style={{
          transform: pressed ? 'translateX(6px)' : 'translateX(0)',
          opacity: pressed ? 0.55 : 0,
        }}
      />
      <span
        aria-hidden="true"
        className="registration-plate pointer-events-none absolute inset-0 rounded-full bg-[#FFD100] mix-blend-multiply transition-transform duration-150 motion-reduce:transition-none"
        style={{
          transform: pressed ? 'rotate(-8deg) scale(0.97)' : 'rotate(0) scale(1)',
          opacity: pressed ? 0.35 : 0,
        }}
      />
      <span className="relative z-10">{children}</span>
    </Component>
  );
}

RegistrationPressButton.propTypes = {
  as: PropTypes.elementType,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  onPointerDown: PropTypes.func,
  onPointerUp: PropTypes.func,
  onPointerLeave: PropTypes.func,
};
