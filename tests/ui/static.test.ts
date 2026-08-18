// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import optionsHtml from '../../options.html?raw';
import popupHtml from '../../popup.html?raw';
import { EN } from '../../src/i18n/en';
import { FR } from '../../src/i18n/fr';
import { setLanguage } from '../../src/i18n';
import { applyStaticText, renderSegments, translation } from '../../src/ui/static';
import { mountBody } from './dom';

/** Toutes les clés de traduction posées dans un gabarit. */
function keysIn(html: string): { path: string; rich: boolean }[] {
  return [...html.matchAll(/data-i18n(-rich|-placeholder)?="([^"]+)"/g)].map((match) => ({
    path: match[2]!,
    rich: match[1] === '-rich',
  }));
}

function lookup(dict: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      dict,
    );
}

beforeEach(() => {
  document.body.innerHTML = '';
  setLanguage('fr');
});

afterEach(() => {
  setLanguage('fr');
});

describe('clés du balisage', () => {
  it('existent dans les deux dictionnaires, avec la bonne forme', () => {
    // Une clé mal orthographiée dans le HTML ne se voit pas à la compilation :
    // la page garderait son texte français sans que rien ne le signale.
    for (const html of [popupHtml, optionsHtml]) {
      for (const { path, rich } of keysIn(html)) {
        for (const dict of [FR, EN]) {
          const value = lookup(dict, path);
          if (rich) expect(Array.isArray(value), path).toBe(true);
          else expect(typeof value, path).toBe('string');
        }
      }
    }
  });

  it('couvrent chaque page', () => {
    expect(keysIn(popupHtml).length).toBeGreaterThan(10);
    expect(keysIn(optionsHtml).length).toBeGreaterThan(25);
  });
});

describe('applyStaticText', () => {
  it('traduit textes, invites et attribut de langue', () => {
    mountBody(optionsHtml);
    setLanguage('en');
    applyStaticText();

    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelector('#add-pattern')!.textContent).toBe(EN.options.addSite);
    expect(document.querySelector<HTMLInputElement>('#new-pattern')!.placeholder).toBe(
      EN.options.patternPlaceholder,
    );
    expect(document.querySelector('#since option')!.textContent).toBe(EN.sinceOption.hour);
  });

  it('reconstruit le texte enrichi en nœuds, sans innerHTML', () => {
    mountBody(optionsHtml);
    setLanguage('en');
    applyStaticText();

    const legend = document.querySelector('.legend')!;
    expect(legend.querySelector('strong')!.textContent).toBe('Checked = data kept');
    expect(legend.textContent).toContain('protects nothing');

    const help = document.querySelector('[data-i18n-rich="options.patternsHelp"]')!;
    const codes = Array.from(help.querySelectorAll('code'));
    expect(codes.map((code) => code.textContent)).toEqual([
      'github.com',
      '*.github.com',
      '*',
      '*google.com',
    ]);
  });

  it('laisse le texte du gabarit en place quand la clé est inconnue', () => {
    // Repli volontaire : une page lisible en français vaut mieux qu'une page
    // vide. Le test des clés ci-dessus est là pour que le cas ne se produise pas.
    document.body.innerHTML = '<p data-i18n="rien.du.tout">texte d’origine</p>';
    applyStaticText();
    expect(document.querySelector('p')!.textContent).toBe('texte d’origine');
  });

  it('translation rend undefined pour une clé qui n’est pas une chaîne', () => {
    expect(translation('options.patternsHelp')).toBeUndefined();
    expect(translation('options.addSite')).toBe(FR.options.addSite);
  });
});

describe('renderSegments', () => {
  it('rend chaque forme de fragment', () => {
    const target = document.createElement('p');
    renderSegments(target, ['avant ', { code: 'x.test' }, ' et ', { strong: 'gras' }]);
    expect(target.querySelector('code')!.textContent).toBe('x.test');
    expect(target.querySelector('strong')!.textContent).toBe('gras');
    expect(target.textContent).toBe('avant x.test et gras');
  });
});
