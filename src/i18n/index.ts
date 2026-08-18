import { EN } from './en';
import { FR } from './fr';
import type { Dict } from './fr';

export type { Dict, Segment } from './fr';

export type Lang = 'fr' | 'en';

/** `'auto'` suit la langue du navigateur ; les autres valeurs l'imposent. */
export type LanguagePreference = 'auto' | Lang;

export const LANGUAGES: Lang[] = ['fr', 'en'];

const DICTIONARIES: Record<Lang, Dict> = { fr: FR, en: EN };

/**
 * Le français est le dictionnaire de référence — celui dont `Dict` est dérivé —
 * donc la valeur de repli. Chaque point d'entrée (popup, page d'options,
 * service worker) appelle `setLanguage` dès son chargement : ce repli ne sert
 * que le temps d'un module, et jamais dans une page rendue.
 *
 * Rien n'est déduit d'un global ambiant (`navigator.language`) : la langue est
 * une décision explicite, prise à un seul endroit, donc reproductible en test.
 */
let active: Lang = 'fr';

/**
 * Toute valeur qui n'est pas une langue connue vaut « suivre le navigateur ».
 * Le test de type ne protège pas d'un réglage venu du stockage : mieux vaut une
 * interface dans la langue du navigateur qu'un dictionnaire absent.
 */
export function resolveLanguage(preference: LanguagePreference, uiLanguage: string): Lang {
  if (preference === 'fr' || preference === 'en') return preference;
  return uiLanguage.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function setLanguage(lang: Lang): void {
  active = lang;
}

export function language(): Lang {
  return active;
}

/** Le dictionnaire actif. Appelé au moment du rendu, jamais mémorisé. */
export function msg(): Dict {
  return DICTIONARIES[active];
}

/**
 * Langue d'interface du navigateur, ou chaîne vide hors extension. `chrome`
 * n'existe pas dans un test Node : la référence non définie est une
 * `ReferenceError`, pas une propriété manquante, d'où le `try`.
 */
export function browserLanguage(): string {
  try {
    return chrome.i18n.getUILanguage();
  } catch {
    return '';
  }
}

/** Applique une préférence enregistrée, en suivant le navigateur si besoin. */
export function applyPreference(preference: LanguagePreference): Lang {
  const lang = resolveLanguage(preference, browserLanguage());
  setLanguage(lang);
  return lang;
}
