import type { Category, KeepRule, Profile, Since } from './types';

const DURATIONS: Record<Exclude<Since, 'all'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

export function sinceToTimestamp(since: Since, now: number): number {
  return since === 'all' ? 0 : now - DURATIONS[since];
}

export type CategoryPlan = {
  category: Category;
  since: number;
  keepRules: KeepRule[];
};

export type Plan = {
  profileId: string;
  since: number;
  categories: CategoryPlan[];
};

export function buildPlan(profile: Profile, now: number): Plan {
  const since = sinceToTimestamp(profile.since, now);
  const categories = [...new Set(profile.categories)].map((category) => ({
    category,
    since,
    keepRules: profile.keepRules.filter((rule) => rule.keep[category] === true),
  }));

  return { profileId: profile.id, since, categories };
}
