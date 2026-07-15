// Business logic for JobPost reads. Controllers stay thin; this owns querying,
// projection, and response validation. buildJobPostFilter operates on an
// already-parsed query (status always present via the contract default).
export function buildJobPostFilter(query) {
  const filter = { status: query.status };
  if (query.category) filter.category = query.category;
  if (query.jobType) filter.jobType = query.jobType;
  if (query.experienceLevel) filter.experienceLevel = query.experienceLevel;
  return filter;
}
