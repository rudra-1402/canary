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

// Maps a lean Mongoose JobPost doc to the public contract shape. _id/__v never
// leak; createdAt becomes an ISO string, or null when absent (seeded-data guard).
export function toJobPostContract(doc) {
  return {
    id: doc._id.toString(),
    clientProfileId: doc.clientProfileId.toString(),
    title: doc.title,
    category: doc.category,
    description: doc.description,
    skills: doc.skills ?? [],
    jobType: doc.jobType,
    budgetOrRate: doc.budgetOrRate,
    experienceLevel: doc.experienceLevel,
    projectLength: doc.projectLength,
    hoursPerWeek: doc.hoursPerWeek,
    screeningQuestions: doc.screeningQuestions ?? [],
    status: doc.status,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
}
