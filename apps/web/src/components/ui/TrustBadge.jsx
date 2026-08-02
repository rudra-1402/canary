import PropTypes from 'prop-types';

const BAND_STYLE = {
  BAND_HIGH: 'bg-band-high-soft text-band-high',
  BAND_MED: 'bg-band-med-soft text-band-med',
  BAND_LOW: 'bg-alarm-soft text-alarm',
};

const BAND_LABEL = {
  BAND_HIGH: 'High trust',
  BAND_MED: 'Med trust',
  BAND_LOW: 'Low trust',
};

// Renders the client's Trust Score band for a job post row. Every non-'scored'/'stale'
// status (pending-score, insufficient-history, not-found, or the batch call failing
// outright) degrades to a neutral "no score yet" pill rather than hiding the row —
// freelancers still need to see the post, just without a trust signal attached.
export default function TrustBadge({ entry }) {
  if (entry && (entry.status === 'scored' || entry.status === 'stale')) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BAND_STYLE[entry.band]}`}
      >
        {BAND_LABEL[entry.band]} · {Math.round(entry.score)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-muted">
      No score yet
    </span>
  );
}

TrustBadge.propTypes = {
  entry: PropTypes.shape({
    status: PropTypes.string.isRequired,
    band: PropTypes.oneOf(['BAND_LOW', 'BAND_MED', 'BAND_HIGH']),
    score: PropTypes.number,
  }),
};
