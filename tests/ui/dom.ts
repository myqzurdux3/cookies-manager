import { vi } from 'vitest';

/**
 * Monte le corps d'un vrai gabarit du dépôt, dépouillé de ses `<script>` et
 * `<link>` : les tests portent sur le même balisage que l'extension livrée, sans
 * que happy-dom aille chercher des ressources.
 */
export function mountBody(html: string): void {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)![1]!;
  document.body.innerHTML = body
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]*>/g, '');
}

export type Reply = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Faux `chrome` minimal : la popup et la page d'options ne parlent au service
 * worker que par messages, et ne touchent qu'à `permissions.request`.
 */
export function stubChrome(reply: (type: string) => Reply, uiLanguage = 'fr-FR') {
  const sent: { type: string; [key: string]: unknown }[] = [];
  const permissionRequests: unknown[] = [];
  let grantPermissions = true;

  const chrome = {
    runtime: {
      async sendMessage(message: { type: string }) {
        sent.push(message);
        return reply(message.type);
      },
    },
    i18n: {
      // La langue d'interface décide de l'affichage quand la préférence est
      // « automatique » : la fixer rend les assertions reproductibles.
      getUILanguage: () => uiLanguage,
    },
    permissions: {
      async request(details: unknown) {
        permissionRequests.push(details);
        return grantPermissions;
      },
    },
  };

  vi.stubGlobal('chrome', chrome);
  return {
    sent,
    permissionRequests,
    denyPermissions() {
      grantPermissions = false;
    },
  };
}

/** Laisse les promesses en attente se résoudre avant d'observer le DOM. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

export function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? '';
}
