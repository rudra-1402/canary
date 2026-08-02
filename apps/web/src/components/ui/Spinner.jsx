import PropTypes from 'prop-types';

export default function Spinner({ label = 'Loading' }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

Spinner.propTypes = {
  label: PropTypes.string,
};
