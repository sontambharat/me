import { Store } from './core/store.js';
import { EventBus } from './core/eventBus.js';
import { AuthService } from './auth/auth.js';
import { Outbox } from './notifications/outbox.js';
import { BuildEngine } from './engines/buildEngine.js';
import { PreviewEngine } from './engines/previewEngine.js';

/**
 * Composition root. Builds the shared content graph + event bus, then the two
 * Phase-1 engines, and wires the review approval gate between them.
 */
export function createApp({ dataFile = null, persist = true, baseUrl = 'http://localhost:3000' } = {}) {
  const store = new Store(dataFile, { persist });
  const eventBus = new EventBus();
  const auth = new AuthService(store);
  const outbox = new Outbox(store, eventBus);
  const build = new BuildEngine(store, eventBus);
  const preview = new PreviewEngine(store, eventBus, build, outbox, { baseUrl });

  // Cross-engine wiring: Build asks Preview whether reviewers have signed off
  // before it allows the in_review → approved transition.
  build.reviewGate = (pageId) => preview.approvalGate(pageId);

  return { store, eventBus, auth, outbox, build, preview };
}
