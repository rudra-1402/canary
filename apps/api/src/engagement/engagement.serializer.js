function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export function toEngagementCommandContract(engagement) {
  const terms = engagement.agreedTerms;
  return {
    id: engagement._id.toString(),
    status: engagement.status,
    freelancerProfileId: engagement.freelancerProfileId.toString(),
    clientProfileId: engagement.clientProfileId.toString(),
    jobPostId: engagement.jobPostId.toString(),
    proposalId: engagement.proposalId.toString(),
    agreedTerms: {
      scope: terms.scope,
      price: terms.price,
      paymentTerms: terms.paymentTerms,
      timeline: terms.timeline,
      dueAt: iso(terms.dueAt),
      revisionsIncluded: terms.revisionsIncluded ?? 0,
    },
    createdAt: iso(engagement.createdAt),
    acceptedAt: iso(engagement.acceptedAt),
  };
}

export function toCompleteTermsContract(terms) {
  return {
    scope: terms.scope,
    price: terms.price,
    paymentTerms: terms.paymentTerms,
    timeline: terms.timeline,
    dueAt: iso(terms.dueAt),
    revisionsIncluded: terms.revisionsIncluded ?? 0,
    jobPostBudgetOrRate: terms.jobPostBudgetOrRate,
    jobType: terms.jobType,
    skills: terms.skills,
    projectLength: terms.projectLength,
    hoursPerWeek: terms.hoursPerWeek,
    proposedDurationDays: terms.proposedDurationDays,
    proposedMilestones: terms.proposedMilestones?.map((milestone) => ({
      description: milestone.description,
      amount: milestone.amount,
    })),
    screeningQuestions: terms.screeningQuestions,
    screeningAnswers: terms.screeningAnswers,
  };
}
