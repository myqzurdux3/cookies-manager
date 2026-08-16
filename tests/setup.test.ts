import { describe, it, expect } from 'vitest';
import manifest from '../public/manifest.json';

describe('manifest', () => {
  it('cible Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('ne demande que les permissions de base, les autres restant optionnelles', () => {
    expect(manifest.permissions.sort()).toEqual(['browsingData', 'cookies', 'storage']);
    expect(manifest.optional_permissions.sort()).toEqual(['contentSettings', 'downloads', 'history']);
  });

  it('interdit tout script distant', () => {
    expect(manifest.content_security_policy.extension_pages).toBe(
      "script-src 'self'; object-src 'self'",
    );
  });
});
