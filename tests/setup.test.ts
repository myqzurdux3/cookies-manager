import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json';

describe('manifest', () => {
  it('cible Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('ne demande que les permissions de base, les autres restant optionnelles', () => {
    // Trier une copie : `sort()` trie sur place le tableau du module JSON
    // importé, donc un état partagé entre tests.
    expect([...manifest.permissions].sort()).toEqual(['browsingData', 'cookies', 'storage']);
    expect([...manifest.optional_permissions].sort()).toEqual([
      'contentSettings',
      'downloads',
      'history',
    ]);
  });

  it("déclare <all_urls>, la permission d'installation la plus large", () => {
    // Elle est nécessaire aux opérations sur les cookies. Ce test existe pour
    // qu'un élargissement supplémentaire soit un choix, pas un accident.
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  it('interdit tout script distant', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
