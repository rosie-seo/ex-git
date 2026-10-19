import { upsertReport } from "./reports.ts";
import type { Store } from "./store.ts";
export const defaultSource = "";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function notion(path: string, body?: object) {
  const started = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (Date.now() - started > 20000)
      throw Error("Notion 요청 시간 제한. 다시 시도하세요.");
    await delay(350);
    const res = await fetch("https://api.notion.com/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(
        Math.max(1000, Math.min(7000, 22000 - (Date.now() - started))),
      ),
    });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await delay(
        Math.min(
          15000,
          Number(res.headers.get("retry-after") || 2 ** attempt) * 1000,
        ),
      );
      continue;
    }
    throw Error(`Notion ${res.status}: 연결 권한·데이터 소스 ID를 확인하세요`);
  }
  throw Error("Notion 재시도 횟수 초과");
}
export async function allBlocks(
  id: string,
  visited = new Set<string>(),
): Promise<any[]> {
  if (visited.has(id)) return [];
  visited.add(id);
  let cursor: string | undefined,
    all: any[] = [];
  do {
    const data = await notion(
      `blocks/${id}/children?page_size=100${cursor ? "&start_cursor=" + encodeURIComponent(cursor) : ""}`,
    );
    for (const b of data.results) {
      all.push(b);
      if (b.has_children || b.type === "child_page") {
        b.children = await allBlocks(b.id, visited);
      } else if (
        b.type === "synced_block" &&
        b.synced_block?.synced_from?.block_id
      ) {
        b.children = await allBlocks(
          b.synced_block.synced_from.block_id,
          visited,
        );
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return all;
}
export function blockText(blocks: any[], depth = 0): string {
  return blocks
    .map((b) => {
      const rich = b[b.type]?.rich_text || [];
      const text =
        b.type === "table_row"
          ? (b.table_row.cells || [])
              .map((c: any[]) =>
                c.map((x) => x.plain_text || x.text?.content || "").join(""),
              )
              .join(" | ")
          : rich
              .map((x: any) => x.plain_text || x.text?.content || "")
              .join("") || (b.type === "child_page" ? b.child_page.title : "");
      const prefix = /heading_/.test(b.type)
        ? "#".repeat(Number(b.type.slice(-1))) + " "
        : ["bulleted_list_item", "numbered_list_item"].includes(b.type)
          ? "- "
          : "";
      const child = b.children ? blockText(b.children, depth + 1) : "";
      return `${"  ".repeat(depth)}${prefix}${text}${child ? "\n" + child : ""}`;
    })
    .join("\n");
}
/** One remote request per invocation. Cursor and nested-block queue live in Supabase. */
export async function syncNotion(db: Store) {
  if (!process.env.NOTION_TOKEN) throw Error("NOTION_TOKEN 미설정");
  const source = process.env.NOTION_DATA_SOURCE_ID;
  if (!source) throw Error("NOTION_DATA_SOURCE_ID 미설정");
  let job = db.get<any>("sync", "current");
  if (!job || job.status === "success" || !job.phase)
    job = {
      status: "running",
      phase: "schema",
      count: 0,
      created: 0,
      changed: 0,
      step: 0,
      cursor: null,
      pages: [],
      startedAt: new Date().toISOString(),
    };
  job.status = "running";
  delete job.error;
  if (job.phase === "schema") {
    const schema = await notion("data_sources/" + source);
    const props = Object.entries(schema.properties || {}) as [string, any][];
    job.dateName = props.find(
      ([n, p]) => p.type === "date" && n.trim() === "날짜",
    )?.[0];
    job.titleName = props.find(([, p]) => p.type === "title")?.[0];
    if (
      !job.dateName ||
      !job.titleName ||
      schema.properties["담당자"]?.type !== "people"
    )
      throw Error("Notion 스키마 확인 필요");
    job.phase = "list";
  } else if (job.phase === "list") {
    const result = await notion(`data_sources/${source}/query`, {
      page_size: 10,
      ...(job.cursor ? { start_cursor: job.cursor } : {}),
    });
    job.pages = result.results;
    job.cursor = result.has_more ? result.next_cursor : null;
    job.hasMore = !!result.has_more;
    job.phase = "blocks";
  } else if (job.phase === "blocks") {
    if (!job.pages.length) {
      if (job.hasMore) job.phase = "list";
      else {
        job.phase = "done";
        job.status = "success";
        job.at = new Date().toISOString();
      }
    } else {
      const p = job.pages[0];
      let stage = db.get<any>("syncStaging", p.id) || {
        blocks: [],
        queue: [{ id: p.id, parent: null, cursor: null }],
        visited: [p.id],
      };
      const work = stage.queue[0];
      if (work) {
        const result = await notion(
          `blocks/${work.id}/children?page_size=100${work.cursor ? "&start_cursor=" + encodeURIComponent(work.cursor) : ""}`,
        );
        stage.queue.shift();
        for (const b of result.results) {
          stage.blocks.push({ ...b, _parent: work.parent });
          const child =
            b.type === "synced_block"
              ? b.synced_block?.synced_from?.block_id
              : b.id;
          if (
            (b.has_children ||
              b.type === "child_page" ||
              (b.type === "synced_block" && child)) &&
            !stage.visited.includes(child)
          ) {
            stage.visited.push(child);
            stage.queue.push({ id: child, parent: b.id, cursor: null });
          }
        }
        if (result.has_more)
          stage.queue.unshift({ ...work, cursor: result.next_cursor });
      }
      if (stage.queue.length) db.put("syncStaging", p.id, stage);
      else {
        const tree = (parent: string | null): any[] =>
          stage.blocks
            .filter((b: any) => b._parent === parent)
            .map((b: any) => ({ ...b, children: tree(b.id) }));
        const blocks = tree(null),
          d = p.properties[job.dateName]?.date,
          people = p.properties["담당자"]?.people || [];
        const result = upsertReport(db, {
          id: p.id.replaceAll("-", ""),
          title: p.properties[job.titleName].title
            .map((x: any) => x.plain_text || x.text?.content || "")
            .join(""),
          url: p.url,
          body: blockText(blocks),
          rawBlocks: blocks,
          owner: people.map((x: any) => x.name || x.id).join("/"),
          ownerIds: people.map((x: any) => x.id),
          start: d?.start?.slice(0, 10) || null,
          end: (d?.end || d?.start)?.slice(0, 10) || null,
          lastEdited: p.last_edited_time,
          complete: true,
          source: "Notion API",
          ...{ createdTime: p.created_time },
        });
        job.count++;
        job.created += +result.created;
        job.changed += +result.changed;
        job.pages.shift();
        db.remove("syncStaging", p.id);
      }
    }
  }
  job.step++;
  db.put("sync", "current", job);
  return {
    status: job.status,
    count: job.count,
    created: job.created,
    changed: job.changed,
    step: job.step,
    dateProperty: job.dateName,
  };
}
