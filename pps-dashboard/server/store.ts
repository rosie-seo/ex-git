/** Request-local unit of work. Supabase commits it atomically with a revision check. */
export type Records = Record<string, Record<string, unknown>>;
export class Store {
  records: Records;
  dirty = false;
  constructor(records: Records = {}) {
    this.records = structuredClone(records);
  }
  list<T = any>(kind: string): T[] {
    return structuredClone(Object.values(this.records[kind] || {})) as T[];
  }
  get<T = any>(kind: string, id: string): T | undefined {
    return this.records[kind] && Object.hasOwn(this.records[kind], id)
      ? (structuredClone(this.records[kind][id]) as T)
      : undefined;
  }
  put(kind: string, id: string, value: any) {
    this.records[kind] ||= Object.create(null);
    Object.defineProperty(this.records[kind], id, {
      value: structuredClone(value),
      writable: true,
      enumerable: true,
      configurable: true,
    });
    this.dirty = true;
    return value;
  }
  remove(kind: string, id: string) {
    if (this.records[kind] && Object.hasOwn(this.records[kind], id)) {
      delete this.records[kind][id];
      this.dirty = true;
    }
  }
  transaction<T>(fn: () => T) {
    const before = structuredClone(this.records),
      dirty = this.dirty;
    try {
      return fn();
    } catch (e) {
      this.records = before;
      this.dirty = dirty;
      throw e;
    }
  }
}
