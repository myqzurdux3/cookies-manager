import { msg } from '../i18n';
import type { Segment } from '../i18n';

/**
 * Traduction du balisage statique.
 *
 * Trois attributs seulement, parce que le balisage n'en demande que trois :
 * `data-i18n` pour un texte, `data-i18n-placeholder` pour une invite de saisie,
 * `data-i18n-rich` pour un paragraphe mêlant `<code>` et `<strong>`. Les
 * infobulles sont toutes construites en JavaScript, elles n'ont pas besoin d'un
 * quatrième attribut.
 *
 * Chaque texte figé du HTML porte une clé (`data-i18n="popup.clean"`) résolue
 * dans le dictionnaire actif. Le HTML garde son texte français d'origine : si
 * une clé venait à manquer, la page reste lisible au lieu de se vider. Le test
 * `tests/ui/static.test.ts` vérifie que chaque clé du balisage existe dans les
 * deux dictionnaires — un oubli est une erreur de test, pas une page blanche.
 */
function lookup(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      msg(),
    );
}

export function translation(path: string): string | undefined {
  const value = lookup(path);
  return typeof value === 'string' ? value : undefined;
}

/**
 * Rend un texte enrichi sans passer par `innerHTML` : les fragments viennent du
 * dictionnaire, jamais d'une donnée de l'utilisateur, et le rendu reste des
 * nœuds construits un par un.
 */
export function renderSegments(target: Element, segments: Segment[]): void {
  target.replaceChildren(
    ...segments.map((segment) => {
      if (typeof segment === 'string') return document.createTextNode(segment);
      const tag = 'code' in segment ? 'code' : 'strong';
      const element = document.createElement(tag);
      element.textContent = 'code' in segment ? segment.code : segment.strong;
      return element;
    }),
  );
}

/** Applique les traductions du balisage statique à un document déjà chargé. */
export function applyStaticText(root: ParentNode = document): void {
  document.documentElement.lang = msg().langTag;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n]'))) {
    const text = translation(element.dataset.i18n ?? '');
    if (text !== undefined) element.textContent = text;
  }

  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-i18n-placeholder]',
  );
  for (const element of Array.from(fields)) {
    const text = translation(element.dataset.i18nPlaceholder ?? '');
    if (text !== undefined) element.placeholder = text;
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('[data-i18n-rich]'))) {
    const segments = lookup(element.dataset.i18nRich ?? '');
    if (Array.isArray(segments)) renderSegments(element, segments as Segment[]);
  }
}
