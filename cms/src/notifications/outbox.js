import { uuid } from '../core/ids.js';

/**
 * Email/notification "outbox".
 *
 * The MVP has no real email provider (Resend/Postmark are Phase-2 infra), so
 * every notification is persisted here and logged. The rest of the system
 * treats this exactly as it would a real mailer; wiring in a provider later is
 * a one-method change in `deliver`.
 */
export class Outbox {
  constructor(store, eventBus) {
    this.store = store;
    this.eventBus = eventBus;
  }

  send({ to, subject, body, kind = 'email', meta = {} }) {
    const message = {
      id: uuid(),
      to,
      subject,
      body,
      kind,
      meta,
      createdAt: new Date().toISOString(),
    };
    this.store.insert('outbox', message);
    this.deliver(message);
    this.eventBus.emit('notification.sent', { message });
    return message;
  }

  deliver(message) {
    console.log(`[outbox] → ${message.to}: ${message.subject}`);
  }

  for(email) {
    return this.store.find('outbox', (m) => m.to === email);
  }
}
