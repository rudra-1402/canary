import PropTypes from 'prop-types';

// Two variants only — this is a base for taste, not a component library.
const variants = {
  primary:
    'border border-foreground bg-foreground text-card hover:bg-secondary-foreground disabled:bg-muted-foreground',
  ghost: 'border border-border bg-transparent text-foreground hover:bg-background',
};

export default function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'ghost']),
  className: PropTypes.string,
};
