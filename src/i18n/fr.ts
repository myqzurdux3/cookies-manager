import type { Category, Since } from '../core/types';

/**
 * Un fragment de texte enrichi : chaîne simple, code, ou emphase. Les
 * paragraphes mêlant `<code>` et `<strong>` sont décrits ainsi plutôt qu'en
 * HTML — le rendu passe par `createElement`, jamais par `innerHTML`, et la
 * traduction reste une donnée typée plutôt qu'un fragment de balisage.
 */
export type Segment = string | { code: string } | { strong: string };

export const FR = {
  langTag: 'fr',
  locale: 'fr-FR',

  categories: {
    cookies: 'Cookies',
    localStorage: 'Stockage local',
    indexedDB: 'IndexedDB',
    cacheStorage: 'Cache des applications',
    serviceWorkers: 'Service workers',
    httpCache: 'Cache HTTP',
    history: 'Historique',
    downloads: 'Liste des téléchargements',
    formData: 'Données de formulaire',
    passwords: 'Mots de passe',
    siteSettings: 'Autorisations de site',
  } as Record<Category, string>,

  /** Dans une phrase : « dernière heure · 2 catégories ». */
  since: {
    hour: 'dernière heure',
    day: 'dernier jour',
    week: 'dernière semaine',
    month: 'dernier mois',
    all: 'tout',
  } as Record<Since, string>,

  /** Dans le menu déroulant, où chaque entrée commence une ligne. */
  sinceOption: {
    hour: 'Dernière heure',
    day: 'Dernier jour',
    week: 'Dernière semaine',
    month: 'Dernier mois',
    all: 'Tout',
  } as Record<Since, string>,

  language: {
    label: 'Langue',
    auto: 'Automatique (navigateur)',
    fr: 'Français',
    en: 'English',
  },

  row: {
    toDelete: (items: number) => `${items} à supprimer`,
    notCountable: 'non chiffrable',
    failed: 'échec',
    unknownReason: 'raison inconnue',
    wipedFully: 'vidé entièrement',
    deletedKept: (deleted: number, kept: number) => `${deleted} supprimé(s) · ${kept} conservé(s)`,
    partialFailure: (error: string) => `échec partiel : ${error}`,
  },

  summary: {
    deleted: (n: number) => `${n} ${n > 1 ? 'éléments supprimés' : 'élément supprimé'}`,
    kept: (n: number) => `${n} ${n > 1 ? 'conservés' : 'conservé'}`,
    wiped: (n: number) =>
      `${n} ${n > 1 ? 'catégories vidées entièrement' : 'catégorie vidée entièrement'}`,
    failed: (n: number) => `${n} ${n > 1 ? 'catégories en échec' : 'catégorie en échec'}`,
  },

  profileMeta: (since: string, count: number) =>
    `${since} · ${count} catégorie${count > 1 ? 's' : ''}`,

  restore: {
    restored: (n: number) => `${n} cookie(s) restauré(s).`,
    allBack: 'Vos sessions sont de nouveau actives.',
    refused: (n: number, details: string) => `${n} refusé(s) par le navigateur — ${details}`,
    failureDetail: (name: string, domain: string, error: string) =>
      `${name} (${domain}) : ${error}`,
  },

  vault: {
    none: 'Aucun coffre enregistré.',
    state: (date: string, cookies: number, domains: number) =>
      `Coffre du ${date} : ${cookies} cookie(s) sur ${domains} domaine(s).`,
    replacement: (date: string, cookies: number) =>
      `Un coffre du ${date} existe déjà (${cookies} ${cookies > 1 ? 'cookies' : 'cookie'}) ` +
      `et sera remplacé : restaurez-le d'abord si vous en avez besoin.`,
  },

  popup: {
    chooserTitle: 'Profil de nettoyage',
    previewTitle: 'Aperçu',
    vaultTitle: 'Phrase secrète du coffre',
    vaultHint:
      'Les cookies supprimés seront sauvegardés chiffrés. Phrase oubliée = coffre définitivement illisible.',
    dangerTitle: 'Suppression définitive',
    dangerHint:
      "Ce profil efface des mots de passe ou des données de formulaire. Aucune exclusion par site n'est possible, et rien n'est récupérable.",
    clean: 'Nettoyer',
    cancel: 'Annuler',
    reportTitle: 'Nettoyage terminé',
    sparedTitle: 'Sites épargnés',
    back: 'Retour aux profils',
    configure: 'Configurer les profils et la keep-list',
    permissionsDenied: "Permissions refusées : ce profil ne peut pas s'exécuter.",
    previewFailed: (reason: string) => `Aperçu impossible : ${reason}`,
    passphraseRequired: "Phrase secrète requise : le coffre est actif, rien n'a été supprimé.",
    cleanFailed: (reason: string) => `Nettoyage impossible : ${reason}`,
    workerUnreachable: (reason: string) => `Service worker injoignable : ${reason}`,
  },

  options: {
    title: 'Cookies Manager — options',
    tagline: 'Suppression des données de navigation, site par site.',
    profilesTitle: 'Profils',
    newProfile: 'Nouveau',
    deleteProfile: 'Supprimer',
    name: 'Nom',
    period: 'Période',
    categoriesTitle: 'Catégories nettoyées',
    keepTitle: 'Sites conservés',
    patternsHelp: [
      'Motifs acceptés : ',
      { code: 'github.com' },
      ' (hôte exact), ',
      { code: '*.github.com' },
      ' (sous-domaines et apex inclus), ',
      { code: '*' },
      ' (tous les sites). Une saisie mal formée comme ',
      { code: '*google.com' },
      ' est corrigée automatiquement.',
    ] as Segment[],
    legend: [
      { strong: 'Case cochée = donnée conservée' },
      " pour ce site, elle survit au nettoyage. Case décochée = donnée supprimée. Une ligne dont aucune case n'est cochée ne protège rien.",
    ] as Segment[],
    patternPlaceholder: 'exemple.com ou *.exemple.com',
    addSite: 'Ajouter un site',
    saveProfile: 'Enregistrer le profil',
    saveHint: "Les modifications ci-dessus ne s'appliquent qu'après enregistrement.",
    vaultTitle: 'Coffre de cookies',
    vaultWarning: [
      "Un coffre de cookies est un coffre de jetons de session actifs : déchiffré, il permet d'usurper vos sessions sans mot de passe ni second facteur. Il est chiffré par une phrase secrète que vous seul connaissez, et qui n'est jamais enregistrée — ",
      { strong: 'une phrase oubliée rend le coffre définitivement illisible' },
      '. Seuls les cookies sont sauvegardés.',
    ] as Segment[],
    vaultEnabled: 'Sauvegarder les cookies avant suppression',
    retention: 'Rétention (jours)',
    saveSettings: 'Enregistrer les réglages',
    passphrase: 'Phrase secrète',
    restore: 'Restaurer les cookies',
    clearVault: 'Supprimer le coffre',
    backupTitle: 'Sauvegarde de la configuration',
    backupHint: 'Exporte et importe les profils, pas les données de navigation.',
    export: 'Exporter en JSON',
    import: 'Importer',
    importPlaceholder: 'Coller un JSON de profils ici',
    languageHint: "Le changement s'applique immédiatement, sans rien enregistrer d'autre.",

    dangerNote: '— définitif, aucune exclusion par site',
    unfilterableNote: (names: string) =>
      `Ignorent la keep-list : ${names}. Ces catégories sont vidées en bloc et ne figurent donc ` +
      `pas dans la grille. Depuis Chrome 144, la suppression des mots de passe par une extension ` +
      `est refusée par le navigateur : l'extension le signale au lieu de prétendre l'avoir faite. ` +
      `Voir docs/limites-navigateur.md.`,
    colSite: 'Site conservé',
    colRemove: 'Retirer',
    emptyKeeplist: 'Aucun site conservé : tout sera supprimé.',
    colPartial: (label: string) => `${label} : conservé en partie. Cocher protège tout le groupe.`,
    colKept: (label: string) => `${label} conservé pour ce site`,
    colRemoved: (label: string) => `${label} supprimé pour ce site`,
    removeTitle: (pattern: string) => `Retirer ${pattern} de la liste des sites conservés`,
    removed: (pattern: string) => `${pattern} retiré. Pensez à enregistrer le profil.`,
    newProfileName: 'Nouveau profil',
    profilesUnreadable: (reason: string) => `Profils illisibles : ${reason}`,
    deleteRefused: (reason: string) => `Suppression refusée : ${reason}`,
    profileDeleted: 'Profil supprimé.',
    patternRefused: (reason: string) => `Motif refusé : ${reason}`,
    alreadyListed: (pattern: string) => `${pattern} est déjà dans la liste.`,
    addedNormalized: (pattern: string) =>
      `Ajouté sous la forme ${pattern} — un wildcard s'écrit *.exemple.com. Pensez à enregistrer.`,
    added: (pattern: string) => `${pattern} ajouté. Pensez à enregistrer le profil.`,
    profileSaved: 'Profil enregistré.',
    saveRefused: (reason: string) => `Enregistrement refusé : ${reason}`,
    exportRefused: (reason: string) => `Export refusé : ${reason}`,
    exported: 'Profils exportés dans la zone de texte.',
    imported: 'Profils importés.',
    importRefused: (reason: string) => `Import refusé : ${reason}`,
    settingsUnreadable: (reason: string) => `Réglages illisibles : ${reason}`,
    settingsSaved: 'Réglages enregistrés.',
    settingsRefused: (reason: string) => `Réglages refusés : ${reason}`,
    restorePassphraseRequired: 'Phrase secrète requise pour restaurer.',
    restoreRefused: (reason: string) => `Restauration refusée : ${reason}`,
    confirmDelete: 'Confirmer la suppression',
    clearVaultArm: 'Suppression définitive du coffre : cliquez à nouveau pour confirmer.',
    clearVaultRefused: (reason: string) => `Suppression du coffre refusée : ${reason}`,
    vaultCleared: 'Coffre supprimé.',
  },

  columns: {
    cookies: 'Cookies',
    storage: 'Stockage',
    httpCache: 'Cache',
    history: 'Historique',
    downloads: 'Téléchargements',
    siteSettings: 'Autorisations',
  },

  columnHints: {
    storage: 'localStorage, IndexedDB, cache des applications et service workers',
    httpCache:
      "Protection partielle : l'exclusion porte sur l'URL de la ressource, pas sur le site " +
      'visité. Ce qu’un site protégé charge depuis un CDN tiers est tout de même vidé.',
    siteSettings:
      'Portée limitée : une extension ne peut retirer que ses propres règles, jamais les ' +
      'autorisations que vous avez accordées vous-même dans Chrome.',
  },

  notes: {
    cookiesTime:
      "Le filtre de période ne s'applique pas aux cookies : l'API ne fournit pas leur date de création.",
    cookiesPartitioned:
      'Les cookies cloisonnés par site (CHIPS) ne sont pas traités : posés par un service tiers ' +
      "intégré dans une page, ils restent hors de portée de l'API et survivent au nettoyage.",
    httpCacheBlock: 'Le cache HTTP est vidé en bloc pour tous les sites non protégés.',
    httpCachePartial:
      "L'exclusion porte sur l'URL de la ressource, pas sur le site visité : ce qu'un site protégé " +
      'charge depuis un domaine tiers (CDN, polices, scripts) est tout de même vidé. La borne de ' +
      "temps porte sur la dernière utilisation d'une entrée, pas sur sa création.",
    siteSettingsScope:
      'Cette catégorie ne retire que les réglages posés par cette extension. Les autorisations que ' +
      'vous avez accordées vous-même dans Chrome ne peuvent pas être effacées par une extension : ' +
      'passez par Chrome, Paramètres, Confidentialité et sécurité, Paramètres des sites.',
    siteSettingsWildcard:
      "Les motifs à wildcard ne sont pas restaurables pour cette catégorie : l'API exige une URL " +
      'concrète pour relire un réglage. Utilisez des motifs exacts pour les autorisations à conserver.',
    passwords:
      "Les mots de passe enregistrés sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
    formData:
      "Les données de formulaire sont tout ou rien : aucune exclusion par site n'est possible. Suppression définitive.",
    passwordsUnavailable: (chromeMajor: number) =>
      `Chrome ${chromeMajor} et suivants ignorent la suppression des mots de passe par une ` +
      "extension : rien n'a été supprimé. Passez par Chrome, Paramètres, Suppression des données de navigation.",
    storageOrigins: (hosts: number) =>
      `${hosts} origine(s) protégée(s). Liste des origines dérivée des cookies et de l'historique : ` +
      "c'est un minorant, la liste n'est pas exhaustive.",
  },

  patterns: {
    empty: 'motif vide',
    noDomain: 'motif sans domaine',
    wildcardLead: 'le wildcard doit être en tête, sous la forme *.exemple.com',
    forbiddenChar: 'caractère interdit dans le motif',
    misplacedDot: 'point mal placé dans le motif',
    unparseableHost: 'nom de domaine impossible à interpréter',
  },

  profiles: {
    light: 'Nettoyage léger',
    full: 'Nettoyage complet',
    invalidFormat: 'format de profils invalide',
    invalidSince: 'période invalide',
    unknownCategory: 'catégorie inconnue',
    emptyPattern: 'motif vide dans la keep-list',
    invalidKeepRule: 'règle de conservation invalide',
    invalidCookieList: 'liste de cookies invalide',
    patternRefused: (pattern: string, reason: string) => `motif refusé « ${pattern} » : ${reason}`,
  },

  errors: {
    invalidRetention: (max: number) => `rétention invalide : attendu un entier de 1 à ${max} jours`,
    invalidLanguage: (accepted: string) => `langue invalide : attendu ${accepted}`,
    vaultMalformed: 'coffre illisible : enregistrement malformé',
    vaultMissing: 'aucun coffre enregistré',
    vaultCorrupted: 'coffre illisible : contenu corrompu',
    vaultWrongPassphrase: 'phrase incorrecte, ou coffre altéré',
    passphraseMissing: 'phrase secrète absente alors que le coffre est actif',
    profileNotFound: (id: string) => `profil introuvable : ${id}`,
    unknownMessage: (type: string) => `message inconnu : ${type}`,
    noCleaner: (category: string) => `aucun cleaner disponible pour ${category}`,
    vaultFailed: (reason: string) => `sauvegarde impossible, cookies conservés : ${reason}`,
  },
};

export type Dict = typeof FR;
