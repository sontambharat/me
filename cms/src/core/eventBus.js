/**
 * In-process publish/subscribe event bus shared by every engine.
 *
 * In the full architecture this is the seam where engines are decoupled: the
 * Build Engine emits domain events (page.updated, page.state_changed, ...) and
 * the Preview Engine — or, later, the Compile/Publish/Render engines — react
 * without a direct call dependency. Swapping this for Redis/NATS/Kafka later
 * only touches this file.
 */
export class EventBus {
  constructor() {
    this._handlers = new Map(); // type -> Set<fn>
    this._wildcard = new Set(); // fns subscribed to every event
    this.log = []; // lightweight in-memory audit of emitted events
  }

  on(type, handler) {
    if (type === '*') {
      this._wildcard.add(handler);
      return () => this._wildcard.delete(handler);
    }
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this._handlers.get(type)?.delete(handler);
  }

  emit(type, payload = {}) {
    const event = { type, payload, at: new Date().toISOString() };
    this.log.push(event);
    if (this.log.length > 1000) this.log.shift();
    for (const fn of this._handlers.get(type) ?? []) safe(fn, event);
    for (const fn of this._wildcard) safe(fn, event);
    return event;
  }
}

function safe(fn, event) {
  try {
    fn(event);
  } catch (err) {
    // A misbehaving subscriber must never break the publisher.
    console.error(`[eventBus] handler for "${event.type}" threw:`, err.message);
  }
}
