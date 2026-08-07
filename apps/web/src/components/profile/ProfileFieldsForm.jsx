import { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '../ui/Button.jsx';
import ErrorNotice from '../ui/ErrorNotice.jsx';
import { Input } from '../ui/input.jsx';
import { Label } from '../ui/label.jsx';
import { Textarea } from '../ui/textarea.jsx';

const csv = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const lines = (value) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

// Every field here maps 1:1 to FreelancerProfilePatchSchema / ClientProfilePatchSchema
// (packages/shared/contracts/profile.js) — this list is a UI concern (which inputs to
// render), the server remains the source of truth for what is actually required/valid.
const COMMON_FIELDS = [
  { name: 'displayName', label: 'Display name', type: 'text' },
  { name: 'headline', label: 'Headline', type: 'text' },
  { name: 'bio', label: 'Bio', type: 'textarea' },
  { name: 'country', label: 'Country', type: 'text' },
];

const ROLE_FIELDS = {
  freelancer: [
    { name: 'skills', label: 'Skills (comma-separated)', type: 'csv' },
    { name: 'hourlyRate', label: 'Hourly rate (USD)', type: 'number' },
    { name: 'languages', label: 'Languages (comma-separated)', type: 'csv' },
    { name: 'portfolio', label: 'Portfolio (one item per line)', type: 'lines' },
    { name: 'workHistory', label: 'Work history (one item per line)', type: 'lines' },
    { name: 'certifications', label: 'Certifications (one item per line)', type: 'lines' },
    { name: 'availableForWork', label: 'Available for new work', type: 'checkbox' },
  ],
  client: [
    { name: 'businessName', label: 'Business name', type: 'text' },
    { name: 'industry', label: 'Industry', type: 'text' },
    { name: 'typicalBudget', label: 'Typical budget (USD)', type: 'number' },
    { name: 'paymentTermsNorm', label: 'Payment terms', type: 'text' },
  ],
};

function toFieldString(value, type) {
  if (value === undefined || value === null) return '';
  if (type === 'lines') return Array.isArray(value) ? value.join('\n') : String(value);
  if (type === 'csv') return Array.isArray(value) ? value.join(', ') : String(value);
  return String(value);
}

function initialState(role, initialValues) {
  const fields = [...COMMON_FIELDS, ...ROLE_FIELDS[role]];
  const state = {};
  for (const field of fields) {
    if (field.type === 'checkbox') {
      state[field.name] = Boolean(initialValues[field.name]);
    } else {
      state[field.name] = toFieldString(initialValues[field.name], field.type);
    }
  }
  state.discoverable = Boolean(initialValues.discoverable);
  return state;
}

function toPatch(role, values) {
  const fields = [...COMMON_FIELDS, ...ROLE_FIELDS[role]];
  const patch = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.type === 'checkbox') {
      patch[field.name] = raw;
    } else if (field.type === 'csv') {
      const parsed = csv(raw);
      if (parsed.length > 0) patch[field.name] = parsed;
    } else if (field.type === 'lines') {
      const parsed = lines(raw);
      if (parsed.length > 0) patch[field.name] = parsed;
    } else if (field.type === 'number') {
      if (raw !== '') patch[field.name] = Number(raw);
    } else if (raw.trim() !== '') {
      patch[field.name] = raw.trim();
    }
  }
  patch.discoverable = values.discoverable;
  return patch;
}

export default function ProfileFieldsForm({ role, initialValues, onSubmit, submitLabel }) {
  const [values, setValues] = useState(() => initialState(role, initialValues));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [onboarding, setOnboarding] = useState(null);

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await onSubmit(toPatch(role, values));
      setOnboarding(result?.onboarding ?? null);
    } catch (err) {
      setError(err.message || 'Could not save your Profile');
    } finally {
      setSubmitting(false);
    }
  }

  const fields = [...COMMON_FIELDS, ...ROLE_FIELDS[role]];

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {fields.map((field) => (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name}>{field.label}</Label>
            {field.type === 'textarea' || field.type === 'lines' ? (
              <Textarea
                id={field.name}
                rows={field.type === 'lines' ? 4 : 3}
                value={values[field.name]}
                onChange={(e) => setField(field.name, e.target.value)}
              />
            ) : field.type === 'checkbox' ? (
              <input
                id={field.name}
                type="checkbox"
                checked={values[field.name]}
                onChange={(e) => setField(field.name, e.target.checked)}
                className="mt-1 size-4"
              />
            ) : (
              <Input
                id={field.name}
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[field.name]}
                onChange={(e) => setField(field.name, e.target.value)}
              />
            )}
          </div>
        ))}

        <div>
          <Label htmlFor="discoverable" className="font-medium">
            <input
              id="discoverable"
              type="checkbox"
              checked={values.discoverable}
              onChange={(e) => setField('discoverable', e.target.checked)}
              className="size-4"
            />
            Discoverable (appear in search)
          </Label>
        </div>

        {error && <ErrorNotice message={error} />}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </form>

      {onboarding && (
        <div
          className="mt-6 rounded-md border border-border bg-card px-4 py-3 text-sm"
          role="status"
        >
          {onboarding.complete ? (
            <p className="font-medium text-foreground">Onboarding complete.</p>
          ) : (
            <>
              <p className="font-medium text-foreground">Still needed:</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {onboarding.missingFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

ProfileFieldsForm.propTypes = {
  role: PropTypes.oneOf(['freelancer', 'client']).isRequired,
  initialValues: PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string,
};

ProfileFieldsForm.defaultProps = {
  initialValues: {},
  submitLabel: 'Save',
};
