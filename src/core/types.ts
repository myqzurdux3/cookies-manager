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
