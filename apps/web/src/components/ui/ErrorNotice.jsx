import PropTypes from 'prop-types';

export default function ErrorNotice({ message, onRetry }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-medium underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

ErrorNotice.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func,
};
