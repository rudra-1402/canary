import { pathToFileURL } from 'node:url';
import { Identity, Profile, JobPost, Proposal, Engagement, Outcome, Review, Payment } from '../src/models/index.js';

const MODELS_TO_CHECK = { Identity, Profile, JobPost, Proposal, Engagement, Outcome, Review, Payment };

export async function validateSeededCollections() {
  const report = [];
  for (const [name, Model] of Object.entries(MODELS_TO_CHECK)) {
    const docs = await Model.find({}).lean();
    let invalidCount = 0;
    const sampleErrors = [];
    for (const doc of docs) {
      const err = new Model(doc).validateSync();
      if (err) {
        invalidCount += 1;
        if (sampleErrors.length < 3) sampleErrors.push({ id: doc._id, message: err.message });
      }
    }
    report.push({ collection: name, checked: docs.length, invalidCount, sampleErrors });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { connectDB, disconnectDB } = await import('../src/db/connection.js');
  await connectDB();
  const report = await validateSeededCollections();
  console.table(report.map(({ sampleErrors, ...rest }) => rest));
  const failed = report.some((r) => r.invalidCount > 0);
  if (failed) {
    console.error('Conformance check FAILED:', JSON.stringify(report, null, 2));
  }
  await disconnectDB();
  process.exit(failed ? 1 : 0);
}
