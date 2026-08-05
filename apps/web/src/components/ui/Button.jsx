import PropTypes from 'prop-types';

// Two variants only — this is a base for taste, not a component library.
const variants = {
  primary: 'border border-ink bg-ink text-surface hover:bg-ink-soft disabled:bg-muted',
  ghost: 'border border-line bg-transparent text-ink hover:bg-paper',
};

export default function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'ghost']),
  className: PropTypes.string,
};
