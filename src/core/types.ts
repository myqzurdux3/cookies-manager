export type Category =
  | 'cookies'
  | 'localStorage'
  | 'indexedDB'
  | 'cacheStorage'
  | 'serviceWorkers'
  | 'httpCache'
  | 'history'
  | 'downloads'
  | 'formData'
  | 'passwords'
  | 'siteSettings';

export const ALL_CATEGORIES: Category[] = [
  'cookies',
  'localStorage',
  'indexedDB',
  'cacheStorage',
  'serviceWorkers',
  'httpCache',
  'history',
  'downloads',
  'formData',
  'passwords',
  'siteSettings',
];

export type Since = 'hour' | 'day' | 'week' | 'month' | 'all';

export type KeepRule = {
  pattern: string;
  keep: Partial<Record<Category, true>>;
  keepCookies?: string[];
};

export type Profile = {
  id: string;
  name: string;
  since: Since;
  categories: Category[];
  keepRules: KeepRule[];
};

import type { CategoryPlan } from './planner';

export type Preview = {
  countable: boolean;
  items: number;
  note?: string;
};

export type CleanReport = {
  status: 'ok' | 'partial' | 'failed';
  deleted: number;
  kept: number;
  error?: string;
};

export interface Cleaner {
  id: Category;
  perSite: 'exact' | 'origin' | 'none';
  preview(plan: CategoryPlan): Promise<Preview>;
  clean(plan: CategoryPlan): Promise<CleanReport>;
}
