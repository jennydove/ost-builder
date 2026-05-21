export type GuidanceField = 'title' | 'description' | 'status' | 'metrics';
export type GuidanceType = 'outcome' | 'opportunity' | 'solution' | 'assumption' | 'experiment';

export interface GuidanceContent {
  title: string;
  description: string;
  source?: string;
}

export const OST_GUIDANCE: Record<GuidanceType, Record<GuidanceField, GuidanceContent>> = {
  outcome: {
    title: {
      title: 'What measurable business or customer outcome are we trying to improve?',
      description: 'This should be a metric you can track over time. Avoid solutions here.',
      source: 'Teresa Torres',
    },
    description: {
      title: 'Why does this outcome matter now?',
      description: 'Add context, constraints, or the time frame for the outcome.',
      source: 'Teresa Torres',
    },
    status: {
      title: 'Is this outcome moving in the right direction?',
      description: 'On Track, At Risk, or Achieved — reflects whether the metric is progressing as expected.',
    },
    metrics: {
      title: 'How will we measure progress toward this outcome?',
      description: 'Define start, current, and target so progress is visible.',
      source: 'Teresa Torres',
    },
  },
  opportunity: {
    title: {
      title: 'What unmet user need, pain, or desire did we observe?',
      description:
        'Phrase this as a user problem, not a feature request. Multiple opportunities can support one outcome.',
      source: 'Teresa Torres',
    },
    description: {
      title: 'What evidence supports this opportunity?',
      description: 'Cite interviews, analytics, or observations that validate the need.',
      source: 'Hustle Badger',
    },
    status: {
      title: 'Where is this opportunity in the discovery process?',
      description: 'Exploring (gathering evidence), Validated (confirmed real need), Prioritized (selected to act on), or Deprioritized.',
    },
    metrics: {
      title: 'How will we validate this opportunity?',
      description: 'Add measurable signals to track if needed.',
      source: 'Teresa Torres',
    },
  },
  solution: {
    title: {
      title: 'What could we build or change to address this opportunity?',
      description: 'This is a hypothesis, not a commitment. Expect many solutions per opportunity.',
      source: 'Teresa Torres',
    },
    description: {
      title: 'What is the simplest version to test?',
      description: 'Keep it small enough to validate quickly.',
      source: 'Hustle Badger',
    },
    status: {
      title: 'Where is this solution in the hypothesis lifecycle?',
      description: 'Ideating (early concept), Testing (experiment underway), Validated (assumption confirmed), or Killed (ruled out).',
    },
    metrics: {
      title: 'What metrics will show this solution worked?',
      description: 'Tie solution progress to outcomes where possible.',
      source: 'Teresa Torres',
    },
  },
  assumption: {
    title: {
      title: 'What must be true for this solution to work?',
      description: 'Assumptions are risks. If this is wrong, the solution fails.',
      source: 'Teresa Torres',
    },
    description: {
      title: 'Why is this assumption risky?',
      description: 'Explain what would break or how value would be lost.',
      source: 'Hustle Badger',
    },
    status: {
      title: 'Where is this assumption in the validation process?',
      description: 'Planned (not yet tested), Running (test underway), or Complete (learning captured).',
    },
    metrics: {
      title: 'What evidence would validate this assumption?',
      description: 'Define the signals you need to see.',
      source: 'Teresa Torres',
    },
  },
  experiment: {
    title: {
      title: 'How can we quickly test this assumption?',
      description: 'Prefer cheap, fast experiments that generate learning over certainty.',
      source: 'Teresa Torres',
    },
    description: {
      title: 'What will we measure to learn?',
      description: 'Define the signal or metric that will confirm or refute the idea.',
      source: 'Hustle Badger',
    },
    status: {
      title: 'Where is this experiment in its lifecycle?',
      description: 'Planned (designed, not started), Running (actively collecting data), or Complete (results in hand).',
    },
    metrics: {
      title: 'What metric decides the experiment?',
      description: 'Define a success threshold before running.',
      source: 'Teresa Torres',
    },
  },
};
