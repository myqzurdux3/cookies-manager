import type { Dict, Segment } from './fr';

export const EN: Dict = {
  langTag: 'en',
  locale: 'en-US',

  categories: {
    cookies: 'Cookies',
    localStorage: 'Local storage',
    indexedDB: 'IndexedDB',
    cacheStorage: 'Application cache',
    serviceWorkers: 'Service workers',
    httpCache: 'HTTP cache',
    history: 'History',
    downloads: 'Download list',
    formData: 'Form data',
    passwords: 'Passwords',
    siteSettings: 'Site permissions',
  },

  since: {
    hour: 'last hour',
    day: 'last day',
    week: 'last week',
    month: 'last month',
    all: 'all time',
  },

  sinceOption: {
    hour: 'Last hour',
    day: 'Last day',
    week: 'Last week',
    month: 'Last month',
    all: 'Everything',
  },

  language: {
    label: 'Language',
    auto: 'Automatic (browser)',
    fr: 'Français',
    en: 'English',
  },

  row: {
    toDelete: (items: number) => `${items} to delete`,
    notCountable: 'not countable',
    failed: 'failed',
    unknownReason: 'reason unknown',
    wipedFully: 'wiped entirely',
    deletedKept: (deleted: number, kept: number) => `${deleted} deleted · ${kept} kept`,
    partialFailure: (error: string) => `partial failure: ${error}`,
  },

  summary: {
    deleted: (n: number) => `${n} ${n > 1 ? 'items deleted' : 'item deleted'}`,
    kept: (n: number) => `${n} kept`,
    wiped: (n: number) => `${n} ${n > 1 ? 'categories wiped entirely' : 'category wiped entirely'}`,
    failed: (n: number) => `${n} ${n > 1 ? 'categories failed' : 'category failed'}`,
  },

  profileMeta: (since: string, count: number) =>
    `${since} · ${count} categor${count > 1 ? 'ies' : 'y'}`,

  restore: {
    restored: (n: number) => `${n} cookie(s) restored.`,
    allBack: 'Your sessions are active again.',
    refused: (n: number, details: string) => `${n} refused by the browser — ${details}`,
    failureDetail: (name: string, domain: string, error: string) => `${name} (${domain}): ${error}`,
  },

  vault: {
    none: 'No vault saved.',
    state: (date: string, cookies: number, domains: number) =>
      `Vault from ${date}: ${cookies} cookie(s) across ${domains} domain(s).`,
    replacement: (date: string, cookies: number) =>
      `A vault from ${date} already exists (${cookies} ${cookies > 1 ? 'cookies' : 'cookie'}) ` +
      `and will be replaced: restore it first if you need it.`,
  },

  popup: {
    chooserTitle: 'Cleaning profile',
    previewTitle: 'Preview',
    vaultTitle: 'Vault passphrase',
    vaultHint:
      'Deleted cookies will be saved encrypted. Forgotten passphrase = vault permanently unreadable.',
    dangerTitle: 'Permanent deletion',
    dangerHint:
      'This profile erases passwords or form data. No per-site exclusion is possible, and nothing can be recovered.',
    clean: 'Clean',
    cancel: 'Cancel',
    reportTitle: 'Cleaning done',
    sparedTitle: 'Spared sites',
    back: 'Back to profiles',
    configure: 'Configure profiles and keep-list',
    permissionsDenied: 'Permissions denied: this profile cannot run.',
    previewFailed: (reason: string) => `Preview failed: ${reason}`,
    passphraseRequired: 'Passphrase required: the vault is enabled, nothing was deleted.',
    cleanFailed: (reason: string) => `Cleaning failed: ${reason}`,
    workerUnreachable: (reason: string) => `Service worker unreachable: ${reason}`,
  },

  options: {
    title: 'Cookies Manager — options',
    tagline: 'Browsing data removal, site by site.',
    profilesTitle: 'Profiles',
    newProfile: 'New',
    deleteProfile: 'Delete',
    name: 'Name',
    period: 'Period',
    categoriesTitle: 'Categories cleaned',
    keepTitle: 'Sites kept',
    patternsHelp: [
      'Accepted patterns: ',
      { code: 'github.com' },
      ' (exact host), ',
      { code: '*.github.com' },
      ' (subdomains and apex included), ',
      { code: '*' },
      ' (every site). A malformed entry such as ',
      { code: '*google.com' },
      ' is corrected automatically.',
    ] as Segment[],
    legend: [
      { strong: 'Checked = data kept' },
      ' for this site, it survives the cleaning. Unchecked = data deleted. A row with no box checked protects nothing.',
    ] as Segment[],
    patternPlaceholder: 'example.com or *.example.com',
    addSite: 'Add a site',
    saveProfile: 'Save profile',
    saveHint: 'The changes above only take effect once saved.',
    vaultTitle: 'Cookie vault',
    vaultWarning: [
      'A cookie vault is a vault of live session tokens: once decrypted, it allows your sessions to be impersonated without a password or second factor. It is encrypted with a passphrase only you know, which is never stored — ',
      { strong: 'a forgotten passphrase makes the vault permanently unreadable' },
      '. Only cookies are saved.',
    ] as Segment[],
    vaultEnabled: 'Save cookies before deletion',
    retention: 'Retention (days)',
    saveSettings: 'Save settings',
    passphrase: 'Passphrase',
    restore: 'Restore cookies',
    clearVault: 'Delete the vault',
    backupTitle: 'Configuration backup',
    backupHint: 'Exports and imports profiles, not browsing data.',
    export: 'Export as JSON',
    import: 'Import',
    importPlaceholder: 'Paste a profiles JSON here',
    languageHint: 'The change applies immediately, without saving anything else.',

    dangerNote: '— permanent, no per-site exclusion',
    unfilterableNote: (names: string) =>
      `Ignore the keep-list: ${names}. These categories are wiped as a block and therefore do not ` +
      `appear in the grid. Since Chrome 144, password deletion by an extension is refused by the ` +
      `browser: the extension reports it instead of pretending it happened. ` +
      `See docs/limites-navigateur.md.`,
    colSite: 'Site kept',
    colRemove: 'Remove',
    emptyKeeplist: 'No site kept: everything will be deleted.',
    colPartial: (label: string) => `${label}: partly kept. Checking protects the whole group.`,
    colKept: (label: string) => `${label} kept for this site`,
    colRemoved: (label: string) => `${label} deleted for this site`,
    removeTitle: (pattern: string) => `Remove ${pattern} from the list of kept sites`,
    removed: (pattern: string) => `${pattern} removed. Remember to save the profile.`,
    newProfileName: 'New profile',
    profilesUnreadable: (reason: string) => `Profiles unreadable: ${reason}`,
    deleteRefused: (reason: string) => `Deletion refused: ${reason}`,
    profileDeleted: 'Profile deleted.',
    patternRefused: (reason: string) => `Pattern refused: ${reason}`,
    alreadyListed: (pattern: string) => `${pattern} is already in the list.`,
    addedNormalized: (pattern: string) =>
      `Added as ${pattern} — a wildcard is written *.example.com. Remember to save.`,
    added: (pattern: string) => `${pattern} added. Remember to save the profile.`,
    profileSaved: 'Profile saved.',
    saveRefused: (reason: string) => `Save refused: ${reason}`,
    exportRefused: (reason: string) => `Export refused: ${reason}`,
    exported: 'Profiles exported to the text area.',
    imported: 'Profiles imported.',
    importRefused: (reason: string) => `Import refused: ${reason}`,
    settingsUnreadable: (reason: string) => `Settings unreadable: ${reason}`,
    settingsSaved: 'Settings saved.',
    settingsRefused: (reason: string) => `Settings refused: ${reason}`,
    restorePassphraseRequired: 'Passphrase required to restore.',
    restoreRefused: (reason: string) => `Restore refused: ${reason}`,
    confirmDelete: 'Confirm deletion',
    clearVaultArm: 'Permanent deletion of the vault: click again to confirm.',
    clearVaultRefused: (reason: string) => `Vault deletion refused: ${reason}`,
    vaultCleared: 'Vault deleted.',
  },

  columns: {
    cookies: 'Cookies',
    storage: 'Storage',
    httpCache: 'Cache',
    history: 'History',
    downloads: 'Downloads',
    siteSettings: 'Permissions',
  },

  columnHints: {
    storage: 'localStorage, IndexedDB, application cache and service workers',
    httpCache:
      'Partial protection: the exclusion applies to the URL of the resource, not to the site ' +
      'visited. Whatever a protected site loads from a third-party CDN is wiped anyway.',
    siteSettings:
      'Limited scope: an extension can only remove its own rules, never the permissions you ' +
      'granted yourself in Chrome.',
  },

  notes: {
    cookiesTime:
      'The time filter does not apply to cookies: the API does not expose their creation date.',
    cookiesPartitioned:
      'Partitioned cookies (CHIPS) are not handled: set by a third-party service embedded in a ' +
      'page, they stay out of reach of the API and survive the cleaning.',
    httpCacheBlock: 'The HTTP cache is wiped as a block for every unprotected site.',
    httpCachePartial:
      'The exclusion applies to the URL of the resource, not to the site visited: whatever a ' +
      'protected site loads from a third-party domain (CDN, fonts, scripts) is wiped anyway. The ' +
      'time bound applies to an entry’s last use, not to its creation.',
    siteSettingsScope:
      'This category only removes the settings written by this extension. The permissions you ' +
      'granted yourself in Chrome cannot be erased by an extension: go to Chrome, Settings, ' +
      'Privacy and security, Site settings.',
    siteSettingsWildcard:
      'Wildcard patterns cannot be restored for this category: the API requires a concrete URL to ' +
      'read a setting back. Use exact patterns for the permissions you want to keep.',
    passwords:
      'Saved passwords are all or nothing: no per-site exclusion is possible. Permanent deletion.',
    formData: 'Form data is all or nothing: no per-site exclusion is possible. Permanent deletion.',
    passwordsUnavailable: (chromeMajor: number) =>
      `Chrome ${chromeMajor} and later ignore password deletion by an extension: nothing was ` +
      'deleted. Go to Chrome, Settings, Delete browsing data.',
    storageOrigins: (hosts: number) =>
      `${hosts} origin(s) protected. The origin list is derived from cookies and history: it is a ` +
      'lower bound, the list is not exhaustive.',
  },

  patterns: {
    wildcardLead: 'the wildcard must come first, as *.example.com',
    forbiddenChar: 'forbidden character in the pattern',
    misplacedDot: 'misplaced dot in the pattern',
    unparseableHost: 'domain name impossible to interpret',
  },

  profiles: {
    light: 'Light cleaning',
    full: 'Full cleaning',
    invalidFormat: 'invalid profile format',
    invalidSince: 'invalid period',
    unknownCategory: 'unknown category',
    emptyPattern: 'empty pattern in the keep-list',
    invalidKeepRule: 'invalid keep rule',
    invalidCookieList: 'invalid cookie list',
    patternRefused: (pattern: string, reason: string) => `pattern refused “${pattern}”: ${reason}`,
  },

  errors: {
    invalidRetention: (max: number) =>
      `invalid retention: expected an integer from 1 to ${max} days`,
    invalidLanguage: (accepted: string) => `invalid language: expected ${accepted}`,
    vaultMalformed: 'vault unreadable: malformed record',
    vaultMissing: 'no vault saved',
    vaultCorrupted: 'vault unreadable: corrupted content',
    vaultWrongPassphrase: 'wrong passphrase, or vault tampered with',
    passphraseMissing: 'passphrase missing while the vault is enabled',
    profileNotFound: (id: string) => `profile not found: ${id}`,
    unknownMessage: (type: string) => `unknown message: ${type}`,
    noCleaner: (category: string) => `no cleaner available for ${category}`,
    vaultFailed: (reason: string) => `backup failed, cookies kept: ${reason}`,
  },
};
