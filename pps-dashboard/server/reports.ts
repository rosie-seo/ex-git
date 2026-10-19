import { createHash } from "node:crypto";
import type { Store } from "./store.js";
import {
  splitActivities,
  suggestPeriod,
  type Report,
  type Activity,
} from "./model.js";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function upsertReport(
  db: Store,
  r: Partial<Report> & { id: string; body: string; title: string },
) {
  const old = db.get<Report>("reports", r.id);
  const sourceHash = hash(
    JSON.stringify({
      body: r.body,
      title: r.title,
      ownerIds: r.ownerIds,
      start: r.start,
      end: r.end,
    }),
  );
  const changed = !!old && (old as any).sourceHash !== sourceHash;
  const guess = suggestPeriod(
    r.title,
    new Date((r as any).createdTime || new Date()).getUTCFullYear(),
  );
  const record = {
    ...r,
    start: r.start || null,
    end: r.end || null,
    suggestedStart: guess.start,
    suggestedEnd: guess.end,
    periodReason: guess.reason,
    periodConfirmed: !!r.start && !!r.end,
    ...old,
    ...r,
    changed: changed || old?.changed || false,
    hash: hash(r.body),
    sourceHash,
  } as Report;
  // User-confirmed period is app-owned and never overwritten by synchronization.
  if (old) {
    record.start = old.start;
    record.end = old.end;
    record.periodConfirmed = old.periodConfirmed;
    record.periodReason = old.periodReason;
    record.suggestedStart = old.suggestedStart;
    record.suggestedEnd = old.suggestedEnd;
  }
  db.transaction(() => {
    db.put("reports", r.id, record);
    if (changed)
      db.put("reportRevisions", r.id + ":" + old!.hash, {
        ...old,
        capturedAt: new Date().toISOString(),
      });
    const seen = new Set<string>();
    for (const [i, a] of splitActivities(r.body).entries()) {
      const id =
        r.id +
        ":" +
        hash(a.day + "\n" + a.text).slice(0, 16) +
        ":" +
        splitActivities(r.body)
          .slice(0, i)
          .filter((x) => x.day === a.day && x.text === a.text).length;
      seen.add(id);
      const prev = db.get<Activity>("activities", id);
      db.put("activities", id, {
        id,
        reportId: r.id,
        ...a,
        taskId: null,
        relatedTaskIds: [],
        linkConfirmed: false,
        outside: false,
        review: false,
        ...prev,
        active: true,
      });
    }
    for (const a of db
      .list<Activity>("activities")
      .filter((x) => x.reportId === r.id)) {
      if (!seen.has(a.id))
        db.put("activities", a.id, { ...a, active: false, review: true });
      else if (changed && a.linkConfirmed)
        db.put("activities", a.id, { ...a, review: true });
    }
  });
  return { changed, created: !old };
}
