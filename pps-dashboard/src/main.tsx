import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./style.css";
import type { Task, Report, Activity, Progress } from "../server/model";
type State = {
  tasks: Task[];
  reports: Report[];
  activities: Activity[];
  progress: Progress[];
  baselines: any[];
  documents: any[];
  aliases: any[];
  sync: any;
  notionConfigured: boolean;
  today: string;
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("서버 응답을 읽을 수 없습니다");
  }
  if (!r.ok) throw Error(data.error || "요청 실패");
  return data;
}
const pct = (x: number | null | undefined) =>
  x == null ? "미확인" : `${x.toFixed(1)}%`;
const pp = (x: number | null | undefined) =>
  x == null ? "계산 불가" : `${x > 0 ? "+" : ""}${x.toFixed(1)}%p`;
const localTime = (s: string) =>
  s ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";
const Icon = ({ name }: { name: string }) => (
  <span className="icon" aria-hidden="true">
    {(
      {
        dashboard: "▦",
        wbs: "▤",
        reports: "⇄",
        settings: "⚙",
        chevron: "›",
        check: "✓",
        sync: "↻",
        add: "＋",
        close: "×",
        file: "▱",
        arrow: "↗",
      } as any
    )[name] || name}
  </span>
);
function App() {
  const [session, setSession] = useState<any>(null),
    [error, setError] = useState(""),
    [state, setState] = useState<State | null>(null),
    [board, setBoard] = useState<any>(null),
    [tab, setTab] = useState("dashboard"),
    [end, setEnd] = useState("2026-10-16"),
    [product, setProduct] = useState(""),
    [owner, setOwner] = useState(""),
    [status, setStatus] = useState(""),
    [reviewOnly, setReviewOnly] = useState(false),
    [search, setSearch] = useState(""),
    [detail, setDetail] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [newPDF, setNewPDF] = useState<any>(null);
  useEffect(() => {
    api("/session")
      .then(setSession)
      .catch((e) => setError(e.message));
  }, []);
  async function reload() {
    const [s, b] = await Promise.all([
      api("/state"),
      api("/dashboard?end=" + end),
    ]);
    setState(s);
    setBoard(b);
  }
  useEffect(() => {
    if (session?.authenticated) reload().catch((e) => setError(e.message));
  }, [session, end]);
  useEffect(() => {
    if (!session?.authenticated || state?.sync?.status !== "running") return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        await api("/sync", "POST", {});
        if (!cancelled) await reload();
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          await reload().catch(() => {});
        }
      }
    }, 750);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state?.sync, end, session?.authenticated]);
  async function act(fn: () => Promise<any>, message = "저장했습니다") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await reload();
      setNotice(message);
      setTimeout(() => setNotice(""), 5000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <div className="center">{error || "PPS 워크스페이스를 불러오는 중…"}</div>
    );
  if (!session.authenticated)
    return (
      <Login
        session={session}
        onLogin={() => api("/session").then(setSession)}
      />
    );
  if (!state || !board)
    return (
      <div className="center">
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={() => reload().catch((e) => setError(e.message))}>
              다시 시도
            </button>
          </>
        ) : (
          "업무 데이터를 불러오는 중…"
        )}
      </div>
    );
  const products = [...new Set(state.tasks.map((t) => t.product))],
    owners = [
      ...new Set(
        state.tasks
          .flatMap((t) => t.owner.split(/[/|]/))
          .map((x) => x.trim())
          .filter((x) => x && x !== "+"),
      ),
    ];
  const filtered = board.rows.filter(
    (r: any) =>
      (!product || r.product === product) &&
      (!owner || r.owner.includes(owner)) &&
      (!status || r.state === status) &&
      (!reviewOnly ||
        !r.scheduleConfirmed ||
        r.actual === null ||
        r.review.length) &&
      (!search ||
        `${r.name} ${r.id} ${r.product}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const unlinked = state.activities.filter(
      (a) => a.active && !a.linkConfirmed,
    ).length,
    summary = board.summary,
    selected = state.tasks.find((t) => t.id === detail);
  const tabs = [
    ["dashboard", "주간 진척 대시보드"],
    ["wbs", "WBS 관리"],
    ["reports", "보고 연결 검토"],
    ["settings", "연결 및 설정"],
  ];
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="PPS 홈">
          <span className="brandmark">p</span>
          <strong>
            PPS<span>PROJECT WORKSPACE</span>
          </strong>
        </a>
        <div className="workspace">
          <span className="workspace-icon">P</span>
          <div>
            <b>솔루션 제품화</b>
            <small>내부 프로젝트 워크스페이스</small>
          </div>
          <span>⌄</span>
        </div>
        <div className="nav-label">프로젝트 관리</div>
        <nav>
          {tabs.map(([key, label]) => (
            <button
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
              key={key}
            >
              <Icon name={key} />
              {label}
              {key === "reports" && unlinked > 0 && (
                <span className="nav-count">{unlinked}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="dot" /> 데이터는 서버에 저장됩니다
          <small>Asia/Seoul · 한국 표준시</small>
          <div className="user">
            <span className="avatar">관</span>
            <div>
              <b>프로젝트 관리자</b>
              <small>보호된 워크스페이스</small>
            </div>
            <button
              title="로그아웃"
              onClick={() =>
                api("/logout", "POST").then(() =>
                  setSession({ ...session, authenticated: false }),
                )
              }
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            솔루션 제품화 <Icon name="chevron" />
            <b>{tabs.find((t) => t[0] === tab)?.[1]}</b>
          </div>
          <div className="header-right">
            <span className="private">
              <Icon name="check" /> 로그인 보호
            </span>
            <span className="avatar small">관</span>
          </div>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              ✓ {notice}
            </div>
          )}
          <div className="page-title">
            <div>
              <div className="eyebrow">PPS SOLUTION · PROJECT CONTROL</div>
              <h1>{tabs.find((t) => t[0] === tab)?.[1]}</h1>
              <p>
                {tab === "dashboard"
                  ? "계획 일정과 업무 보고를 연결해, 근거 있는 진척을 확인하세요."
                  : tab === "wbs"
                    ? "원본 일정의 가정을 검토하고 프로젝트 기준 버전을 관리하세요."
                    : tab === "reports"
                      ? "활동 단위로 원문을 확인하고 WBS 업무와 연결하세요."
                      : "운영용 인증과 데이터 수집 상태를 확인하세요."}
              </p>
            </div>
            <div className="actions">
              <button onClick={() => window.location.assign("/api/export")}>
                <Icon name="arrow" /> 데이터 내보내기
              </button>
              <button
                className="primary"
                disabled={busy || state.sync?.status === "running"}
                onClick={() =>
                  act(() => api("/sync", "POST"), "노션 동기화를 시작했습니다")
                }
              >
                <Icon name="sync" />
                {state.sync?.status === "running"
                  ? "동기화 중…"
                  : "노션 동기화"}
              </button>
            </div>
          </div>
          <div className="source-line">
            <span className="source-pill">
              {state.tasks.length || state.reports.length
                ? "실제 데이터"
                : "데이터 없음"}
            </span>{" "}
            WBS · 노션 {state.reports.length}개 보고{" "}
            {state.notionConfigured
              ? "· 운영용 토큰 설정됨"
              : "· 운영 동기화 미연결"}
            <span className="source-time">
              마지막 수집 {localTime(state.sync?.at || state.sync?.startedAt)}{" "}
              {state.sync?.status === "error"
                ? "· 실패"
                : state.sync?.status === "success"
                  ? "· 성공"
                  : ""}
            </span>
          </div>
          {tab === "dashboard" && (
            <>
              <section className="filter-bar">
                <label>
                  보고 주차 종료일
                  <input
                    aria-label="보고 주차 종료일"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
                <label>
                  제품 / 프로젝트
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  >
                    <option value="">전체 제품</option>
                    {products.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  담당자
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">전체 담당자</option>
                    {owners.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  업무 상태
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">전체 상태</option>
                    {["계획 미달", "계획 충족", "완료", "확인 필요"].map(
                      (p) => (
                        <option key={p}>{p}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={reviewOnly}
                    onChange={(e) => setReviewOnly(e.target.checked)}
                  />
                  확인 필요만
                </label>
              </section>
              {!board.baseline && (
                <div className="alert warning">
                  <span>ⓘ</span>
                  <div>
                    <b>WBS 기준 버전을 확정해 주세요</b>
                    <span>
                      원본의 월 단위 일정은 검토 전 가정입니다. WBS 관리에서
                      일정을 확인한 뒤 기준 버전을 확정하면 계획 진척률이
                      계산됩니다.
                    </span>
                  </div>
                  <button onClick={() => setTab("wbs")}>검토하기 →</button>
                </div>
              )}
              <div className="metrics">
                {[
                  [
                    "계획 진척률",
                    summary.planned === null
                      ? "확인 필요"
                      : pct(summary.planned),
                    `${board.baseline?.name || "기준 버전 미확정"} · 일정상 기대치`,
                  ],
                  [
                    "확인된 업무 기준 실제",
                    pct(summary.actual),
                    `${summary.confirmed} / ${summary.total}개 업무 · 전체 진척률 아님`,
                  ],
                  [
                    "진척률 확인 비율",
                    `${summary.coverage.toFixed(0)}%`,
                    "미입력은 0%로 집계하지 않습니다",
                  ],
                  [
                    "계획 미달 업무",
                    `${summary.below}건`,
                    "계획과 실제가 확인된 업무 기준",
                  ],
                  [
                    "미연결 보고 활동",
                    `${unlinked}건`,
                    "연결 검토 후 수동 확정",
                  ],
                ].map(([title, value, sub], i) => (
                  <div className={"metric metric-" + i} key={title}>
                    <div>
                      {title}
                      <span>{["◷", "↗", "◎", "⚑", "⇄"][i]}</span>
                    </div>
                    <strong>{value}</strong>
                    {i === 2 && (
                      <div className="mini-track">
                        <i style={{ width: summary.coverage + "%" }} />
                      </div>
                    )}
                    <small>{sub}</small>
                  </div>
                ))}
              </div>
              <div className="table-top">
                <div>
                  <h2>
                    업무별 계획 대비 진척 <span>{filtered.length}</span>
                  </h2>
                  <p>
                    {board.baseline ? "확정 기준 버전 적용" : "일정 검토 전"} ·{" "}
                    {summary.equalWeight
                      ? "미설정 업무는 동일 가중치 1 적용"
                      : "사용자 가중치 적용"}{" "}
                    · 상위/하위 중복 합산 제외
                  </p>
                </div>
                <input
                  className="search"
                  placeholder="업무명 또는 WBS ID 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "제품",
                        "WBS ID",
                        "업무명",
                        "담당자",
                        "계획 기간",
                        "계획",
                        "실제",
                        "차이",
                        "전주 대비",
                        "이번 주 진행 내용",
                        "확인 상태",
                      ].map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r: any) => (
                      <tr
                        key={r.id}
                        onClick={() => setDetail(r.id)}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setDetail(r.id)}
                      >
                        <td className="sticky-product">
                          <span className="product-label">{r.product}</span>
                        </td>
                        <td className="code">{r.id}</td>
                        <td className="task-name">
                          {r.name}
                          <small>PDF {r.sourcePages.join(", ")}p</small>
                        </td>
                        <td>{r.owner}</td>
                        <td className="date-cell">
                          {r.start || "확인 필요"}
                          <br />~ {r.end || "확인 필요"}
                          {!r.scheduleConfirmed && (
                            <small className="amber">가정 · 미확정</small>
                          )}
                        </td>
                        <td>
                          <ProgressCell value={r.planned} />
                        </td>
                        <td>
                          <ProgressCell value={r.actual} green />
                          {r.carried && <small>이월 · {r.lastConfirmed}</small>}
                        </td>
                        <td
                          className={
                            r.delta !== null && r.delta < 0
                              ? "negative"
                              : "muted"
                          }
                        >
                          {pp(r.delta)}
                        </td>
                        <td className="muted">{pp(r.change)}</td>
                        <td className="evidence-cell">
                          {r.evidence.length
                            ? r.evidence.map((e: any) => e.text).join(" · ")
                            : "확정된 이번 주 활동 없음"}
                        </td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (r.state === "계획 미달"
                                ? "danger"
                                : r.state === "확인 필요"
                                  ? "pending"
                                  : "success")
                            }
                          >
                            {r.state}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <Empty text="필터에 맞는 업무가 없습니다." />
                )}
              </div>
              <div className="table-footer">
                행을 선택하면 원문 근거와 진척 이력을 확인할 수 있습니다.
                <span>총 {summary.total}개 집계 대상 업무</span>
              </div>
              <div className="footnotes">
                <b>집계 안내</b>
                <span>
                  계획은 달력일 선형 기대치입니다. 실제는 종료일 이전의 최신
                  확정 누적값이며 주간 수치를 합산하지 않습니다.
                </span>
                <span>
                  동일 업무 집합 {summary.pairedCount}건 비교: 계획{" "}
                  {pct(summary.pairedPlanned)} · 실제{" "}
                  {pct(summary.pairedActual)} · 차이 {pp(summary.pairedDelta)}
                </span>
                <span>
                  요약 카드는 전체 집계 대상 기준이며, 위 필터는 상세 표에
                  적용됩니다. 주간 구간: 선택 종료일 이전 7일.
                </span>
              </div>
            </>
          )}
          {tab === "wbs" && (
            <>
              <div className="two-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>기준 버전 관리</h2>
                    <span className="badge pending">
                      {state.tasks.filter((t) => !t.scheduleConfirmed).length}개
                      일정 미확정
                    </span>
                  </div>
                  <p>
                    수정은 작업본에 저장됩니다. 기준 확정 시 전체 업무 스냅샷을
                    보존하며, 과거 버전과 연결 이력을 유지합니다.
                  </p>
                  <BaselineForm
                    busy={busy}
                    onSubmit={(v) =>
                      act(
                        () => api("/baselines", "POST", v),
                        "기준 버전을 확정했습니다",
                      )
                    }
                  />
                  <div className="version-list">
                    {state.baselines.map((b) => (
                      <div key={b.id}>
                        <Icon name="file" />
                        <b>{b.name}</b>
                        <span>
                          {b.effectiveDate}부터 · {b.tasks.length}개 업무
                        </span>
                      </div>
                    ))}
                    {!state.baselines.length && (
                      <small>아직 확정한 기준 버전이 없습니다.</small>
                    )}
                  </div>
                </section>
                <section className="panel">
                  <h2>담당자 별칭</h2>
                  <p>
                    원문 담당자 이름을 자동 변경하지 않습니다. 동일 인물 확인 후
                    연결하세요.
                  </p>
                  <AliasForm
                    busy={busy}
                    onSubmit={(v) => act(() => api("/aliases", "POST", v))}
                  />
                  {state.aliases.map((a) => (
                    <div className="alias" key={a.from}>
                      {a.from} → <b>{a.to}</b>
                      <span className="badge success">사용자 확인</span>
                    </div>
                  ))}
                </section>
              </div>
              <section className="panel pdf-panel">
                <div>
                  <h2>원본 문서 및 새 버전</h2>
                  <p>
                    1~2p 구성도 · 3p 전체 개요 · 4~12p 상세 일정. 개요는 중복
                    합산하지 않습니다.
                  </p>
                </div>
                <div className="actions">
                  <a
                    className="button"
                    href="/source/wbs-v1.7.pdf"
                    target="_blank"
                    aria-disabled={!state.documents.length}
                    onClick={e=>{if(!state.documents.length){e.preventDefault();setError("원본 PDF가 없습니다. 비공개 자료 이관 또는 새 PDF 등록을 먼저 진행하세요.")}}}
                  >
                    원본 PDF 열기 ↗
                  </a>
                  <label className="button primary">
                    {busy ? "추출 중…" : "＋ 새 PDF 버전 등록"}
                    <input
                      type="file"
                      accept="application/pdf"
                      hidden
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        act(async () => {
                          if (f.size > 2.5 * 1024 * 1024)
                            throw Error(
                              "웹 업로드는 2.5MB 이하입니다. 큰 PDF는 비공개 이관 도구를 사용하세요",
                            );
                          const b = await new Promise<string>(
                            (resolve, reject) => {
                              const fr = new FileReader();
                              fr.onload = () =>
                                resolve(String(fr.result).split(",")[1]);
                              fr.onerror = reject;
                              fr.readAsDataURL(f);
                            },
                          );
                          const data = await api("/pdf", "POST", {
                            name: f.name,
                            base64: b,
                          });
                          setNewPDF(data);
                        }, "PDF 추출 후보를 검토해 주세요");
                      }}
                    />
                  </label>
                </div>
              </section>
              {newPDF && (
                <ImportReview
                  data={newPDF}
                  tasks={state.tasks}
                  busy={busy}
                  onSave={(tasks) =>
                    act(async () => {
                      await api("/import/tasks", "POST", { tasks });
                      setNewPDF(null);
                    }, "새 버전 업무를 작업본에 반영했습니다")
                  }
                />
              )}
              <div className="table-top">
                <h2>
                  추출 업무 검토 <span>{state.tasks.length}</span>
                </h2>
                <input
                  className="search"
                  placeholder="업무 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>WBS ID</th>
                      <th>제품 / 업무</th>
                      <th>담당자 (원문)</th>
                      <th>원본 월 단위 기간</th>
                      <th>검토 항목</th>
                      <th>일정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.tasks
                      .filter((t) =>
                        `${t.name} ${t.product} ${t.id}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((t) => (
                        <tr key={t.id} onClick={() => setDetail(t.id)}>
                          <td className="code">{t.id}</td>
                          <td className="task-name">
                            <small>
                              {t.product} · {t.sourcePages.join(", ")}p
                            </small>
                            {t.name}
                          </td>
                          <td>{t.owner}</td>
                          <td>
                            {t.sourceStart || "확인 필요"} ~{" "}
                            {t.sourceEnd || "확인 필요"}
                          </td>
                          <td className="review-cell">
                            {t.review.map((r, i) => (
                              <span key={i}>• {r}</span>
                            ))}
                          </td>
                          <td>
                            <span
                              className={
                                "badge " +
                                (t.scheduleConfirmed ? "success" : "pending")
                              }
                            >
                              {t.scheduleConfirmed ? "확정" : "확인 필요"}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "reports" && (
            <ReportsView
              state={state}
              busy={busy}
              onAction={act}
              onTask={setDetail}
            />
          )}
          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel">
                <h2>Notion 운영 연결</h2>
                <span
                  className={
                    "badge " + (state.notionConfigured ? "success" : "pending")
                  }
                >
                  {state.notionConfigured
                    ? "토큰 설정됨 · 동기화로 검증 필요"
                    : "운영용 인증 미연결"}
                </span>
                <p>
                  이 채팅의 Notion MCP 인증은 웹사이트 서버에서 재사용하지
                  않습니다. 보고 원문은 비공개 이관 또는 운영 동기화 후
                  표시됩니다.
                </p>
                <ol>
                  <li>Notion에서 내부 통합을 생성하고 대상 DB에 연결합니다.</li>
                  <li>
                    서버 환경변수 <code>NOTION_TOKEN</code>에 비밀 키를
                    설정합니다.
                  </li>
                  <li>
                    <code>NOTION_DATA_SOURCE_ID</code>를 확인하고 서버를
                    재시작합니다.
                  </li>
                  <li>노션 동기화 버튼으로 수집 결과를 확인합니다.</li>
                </ol>
                <p>
                  키를 이 화면이나 채팅에 입력하지 마세요. 원본 Notion은 읽기
                  전용으로만 사용합니다.
                </p>
                <div className="config-row">
                  데이터 소스 <code>NOTION_DATA_SOURCE_ID 환경변수</code>
                </div>
                <div className="config-row">
                  날짜 속성 <code>날짜␠</code> (끝 공백 보존)
                </div>
              </section>
              <section className="panel">
                <h2>수집 상태</h2>
                <pre>{JSON.stringify(state.sync, null, 2)}</pre>
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api("/snapshot/reimport", "POST"),
                      "동일 스냅샷을 다시 반영했습니다. 확정 연결은 유지됩니다.",
                    )
                  }
                >
                  MCP 스냅샷 재가져오기
                </button>
                <hr />
                <h2>저장과 접근</h2>
                <p>
                  Supabase 영속 저장 · 로그인 필수 · HttpOnly 세션 · 출처 검증.
                  데이터 내보내기에는 회사 원문이 포함됩니다.
                </p>
                <p>
                  AI API는 연결하지 않았습니다. 키워드 기반 추천과 수동
                  연결·입력은 독립적으로 작동합니다.
                </p>
                <p>가중치 기반 세부 업무 완료 계산은 향후 확장 대상입니다.</p>
              </section>
            </div>
          )}
          <footer>
            PPS · 솔루션 제품화 진척 관리
            <span>원문은 보존하고, 판단은 확인합니다.</span>
          </footer>
        </main>
      </div>
      {selected && (
        <TaskPanel
          key={selected.id}
          task={selected}
          state={state}
          end={end}
          busy={busy}
          onClose={() => setDetail(null)}
          onAction={act}
        />
      )}
    </div>
  );
}
function Login({ session, onLogin }: { session: any; onLogin: () => void }) {
  const [user, setUser] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-bg">
      <section className="login-card">
        <span className="brandmark">p</span>
        <div className="eyebrow">PPS PROJECT WORKSPACE</div>
        <h1>
          진척을 확인하는
          <br />
          하나의 기준.
        </h1>
        <p>
          WBS 계획과 업무보고를 연결하는
          <br />
          솔루션 제품화 워크스페이스
        </p>
        {!session.configured ? (
          <div className="alert warning">
            서버의 Supabase 연결과 관리자 인증을 먼저 설정하세요.
            <br />
            ADMIN_PASSWORD 12자 이상
            <br />
            SESSION_SECRET 32자 이상
            <br />
            설정 전 회사 데이터와 API는 차단됩니다.
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("/login", "POST", { user, password });
                onLogin();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              계정
              <input
                value={user}
                autoComplete="username"
                onChange={(e) => setUser(e.target.value)}
              />
            </label>
            <label>
              비밀번호
              <input
                value={password}
                type="password"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="negative" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "확인 중…" : "워크스페이스 로그인 →"}
            </button>
          </form>
        )}
        <small>접근 권한이 있는 관리자만 사용할 수 있습니다.</small>
      </section>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <span>▱</span>
      <p>{text}</p>
    </div>
  );
}
function ProgressCell({
  value,
  green = false,
}: {
  value: number | null;
  green?: boolean;
}) {
  return (
    <div className={"progress-cell " + (green ? "green" : "")}>
      <b className={value === null ? "muted" : ""}>
        {value === null && !green ? "확인 필요" : pct(value)}
      </b>
      {value !== null && (
        <div>
          <i style={{ width: value + "%" }} />
        </div>
      )}
    </div>
  );
}
function BaselineForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: any) => void;
  busy: boolean;
}) {
  const [name, setName] = useState("검토 기준 버전"),
    [date, setDate] = useState("2026-10-01");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, effectiveDate: date });
      }}
    >
      <label>
        기준 버전 이름
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        적용 시작일
        <input
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button disabled={busy} className="primary">
        기준 버전 확정
      </button>
    </form>
  );
}
function AliasForm({
  onSubmit,
  busy,
}: {
  onSubmit: (v: any) => void;
  busy: boolean;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ from, to });
      }}
    >
      <label>
        원문 이름
        <input
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        같은 인물로 확인한 이름
        <input
          placeholder="확인 후 입력"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <button disabled={busy}>별칭 확정</button>
    </form>
  );
}
function TaskPanel({
  task,
  state,
  end,
  busy,
  onClose,
  onAction,
}: {
  task: Task;
  state: State;
  end: string;
  busy: boolean;
  onClose: () => void;
  onAction: (fn: () => Promise<any>, message?: string) => void;
}) {
  const [edit, setEdit] = useState({ ...task }),
    [value, setValue] = useState(""),
    [effective, setEffective] = useState(end),
    [note, setNote] = useState(""),
    [reportId, setReportId] = useState(""),
    [page, setPage] = useState(task.sourcePages[0] || 1);
  const history = state.progress
    .filter((p) => p.taskId === task.id)
    .sort(
      (a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate) ||
        b.confirmedAt.localeCompare(a.confirmedAt),
    );
  const links = state.activities.filter(
    (a) =>
      a.active &&
      a.linkConfirmed &&
      (a.taskId === task.id || a.relatedTaskIds.includes(task.id)),
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="업무 상세"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <span className="code">{task.id}</span>
          <button aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer-body">
          <span className="product-label">{task.product}</span>
          <h2>{task.name}</h2>
          <p className="muted">
            원본 {task.sourceVersion} · PDF {task.sourcePages.join(", ")}페이지
          </p>
          <div className="alert warning">
            원본: {task.sourceStart} ~ {task.sourceEnd} ({task.sourcePrecision})
            <br />
            월초·월말 날짜는 가정이며, 별도 검토 후 확정합니다.
          </div>
          <h3>일정 및 업무 수정</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAction(
                () => api("/tasks/" + task.id, "PATCH", edit),
                "작업본을 저장했습니다. 대시보드 반영은 기준 버전을 새로 확정하세요.",
              );
            }}
          >
            <label>
              제품
              <input
                required
                value={edit.product}
                onChange={(e) => setEdit({ ...edit, product: e.target.value })}
              />
            </label>
            <label>
              업무명
              <input
                required
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              담당자 (원문 보존)
              <input
                value={edit.owner}
                onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                시작일
                <input
                  required
                  type="date"
                  value={edit.start}
                  onChange={(e) => setEdit({ ...edit, start: e.target.value })}
                />
              </label>
              <label>
                종료일
                <input
                  required
                  type="date"
                  value={edit.end}
                  min={edit.start}
                  onChange={(e) => setEdit({ ...edit, end: e.target.value })}
                />
              </label>
            </div>
            <label>
              가중치 (비우면 1)
              <input
                type="number"
                min="0.001"
                step="any"
                value={edit.weight ?? ""}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    weight:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              검토 메모 (한 줄에 하나)
              <textarea
                value={edit.review.join("\n")}
                onChange={(e) =>
                  setEdit({
                    ...edit,
                    review: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={edit.scheduleConfirmed}
                onChange={(e) =>
                  setEdit({ ...edit, scheduleConfirmed: e.target.checked })
                }
              />
              원본 막대와 일정을 확인했습니다
            </label>
            <button className="primary" disabled={busy}>
              작업본 저장
            </button>
          </form>
          <h3>원본 일정 확인</h3>
          {task.sourceRows?.map((r) => (
            <p key={r.page}>
              <b>{r.page}p 원문 업무명</b>
              <br />
              {r.name}
            </p>
          ))}
          <div className="actions">
            {task.sourcePages.map((n) => (
              <button
                className={page === n ? "selected" : ""}
                onClick={() => setPage(n)}
                key={n}
              >
                {n}p
              </button>
            ))}
            <a
              className="button"
              target="_blank"
              href={
                "/source/" +
                (task.sourceVersion === "v1.7"
                  ? "wbs-v1.7.pdf"
                  : task.sourceVersion + ".pdf") +
                "#page=" +
                page
              }
            >
              PDF 열기 ↗
            </a>
          </div>
          {task.sourceVersion === "v1.7" && (
            <a target="_blank" href={"/source/page-" + page + ".png"}>
              <img
                className="pdf-image"
                src={"/source/page-" + page + ".png"}
                alt={`WBS 원본 ${page}페이지`}
              />
            </a>
          )}
          <h3>누적 실제 진척률 확정</h3>
          <p>
            직접 확인한 누적 수치를 입력하세요. 기준일은 수치가 확인된
            보고일입니다. 과거 기준일 입력은 과거 집계의 정정으로 기록됩니다.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAction(
                () =>
                  api("/progress", "POST", {
                    taskId: task.id,
                    value: Number(value),
                    effectiveDate: effective,
                    note,
                    reportId: reportId || null,
                  }),
                "누적 진척률을 확정했습니다",
              );
            }}
          >
            <div className="form-grid">
              <label>
                누적 실제 진척률 (%)
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                수치 기준일
                <input
                  required
                  type="date"
                  value={effective}
                  max={state.today}
                  onChange={(e) => setEffective(e.target.value)}
                />
              </label>
            </div>
            <label>
              근거 보고 (선택)
              <select
                value={reportId}
                onChange={(e) => setReportId(e.target.value)}
              >
                <option value="">담당자 직접 확인</option>
                {state.reports
                  .filter((r) => r.periodConfirmed)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.owner || "담당자 미확인"} · {r.title} · {r.end}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              확인 근거 / 정정 이유
              <textarea
                required
                placeholder="확인한 산출물 또는 담당자 확인 내용을 입력하세요"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy}>
              진척률 확정
            </button>
          </form>
          <h3>주차별 진척 이력</h3>
          {!history.length ? (
            <Empty text="아직 확정한 진척률이 없습니다." />
          ) : (
            history.map((p) => (
              <div className="history" key={p.id}>
                <strong>{p.value}%</strong>
                <div>
                  <b>수치 기준일 {p.effectiveDate}</b>
                  <p>{p.note}</p>
                  <small>
                    확정 {localTime(p.confirmedAt)} · {p.actor}
                    {p.effectiveDate > end
                      ? " · 선택 주차 이후 (집계 제외)"
                      : ""}
                  </small>
                </div>
              </div>
            ))
          )}
          <h3>연결된 보고 원문</h3>
          {!links.length && <Empty text="확정된 보고 연결이 없습니다." />}
          {links.map((a) => {
            const r = state.reports.find((r) => r.id === a.reportId)!;
            return (
              <div className="evidence" key={a.id}>
                <div>
                  <span className="badge">
                    {a.taskId === task.id
                      ? "대표 업무"
                      : "관련 업무 · 중복 집계 제외"}
                  </span>
                  {a.review && (
                    <span className="badge pending">원문 변경 · 재검토</span>
                  )}
                </div>
                <blockquote>{a.text}</blockquote>
                <small>
                  {r.title} · {a.day} ·{" "}
                  {r.periodConfirmed ? r.end : "기간 미확정"}
                </small>
                <a target="_blank" rel="noreferrer" href={r.url}>
                  Notion 원문 ↗
                </a>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
function ReportsView({
  state,
  busy,
  onAction,
  onTask,
}: {
  state: State;
  busy: boolean;
  onAction: (fn: () => Promise<any>, message?: string) => void;
  onTask: (id: string) => void;
}) {
  const [selected, setSelected] = useState(state.reports[0]?.id || ""),
    [filter, setFilter] = useState("all");
  const r = state.reports.find((r) => r.id === selected);
  const reports = state.reports.filter(
    (r) =>
      filter === "all" ||
      (filter === "period" && !r.periodConfirmed) ||
      (filter === "changed" && r.changed) ||
      (filter === "unlinked" &&
        state.activities.some(
          (a) => a.active && a.reportId === r.id && !a.linkConfirmed,
        )),
  );
  return (
    <div className="report-layout">
      <section className="report-list panel">
        <h2>
          업무 보고 <span>{state.reports.length}</span>
        </h2>
        <select
          aria-label="보고 필터"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">전체 보고</option>
          <option value="period">기간 미확정</option>
          <option value="unlinked">미연결 활동 있음</option>
          <option value="changed">원문 변경</option>
        </select>
        {reports.map((r) => (
          <button
            key={r.id}
            className={"report-item " + (r.id === selected ? "selected" : "")}
            onClick={() => setSelected(r.id)}
          >
            <span>{r.title}</span>
            <b>{r.owner || "담당자 이름 미확인"}</b>
            <small>
              {r.periodConfirmed
                ? `${r.start} ~ ${r.end}`
                : "보고 기간 확인 필요"}
            </small>
            <span
              className={"badge " + (r.periodConfirmed ? "success" : "pending")}
            >
              {r.changed
                ? "원문 변경"
                : r.periodConfirmed
                  ? "기간 확인"
                  : "기간 미확정"}
            </span>
          </button>
        ))}
        {!reports.length && <Empty text="해당 보고가 없습니다." />}
      </section>
      <div>
        {r ? (
          <ReportDetail
            key={r.id}
            report={r}
            state={state}
            busy={busy}
            onAction={onAction}
            onTask={onTask}
          />
        ) : (
          <Empty text="검토할 보고를 선택하세요." />
        )}
      </div>
    </div>
  );
}
function ReportDetail({
  report: r,
  state,
  busy,
  onAction,
  onTask,
}: {
  report: Report;
  state: State;
  busy: boolean;
  onAction: (fn: () => Promise<any>, message?: string) => void;
  onTask: (id: string) => void;
}) {
  const [start, setStart] = useState(r.start || r.suggestedStart || ""),
    [end, setEnd] = useState(r.end || r.suggestedEnd || "");
  const activities = state.activities.filter(
    (a) => a.reportId === r.id && (a.active || a.review),
  );
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">NOTION REPORT · 실제 원문</span>
            <h2>
              {r.title} {r.owner && "· " + r.owner}
            </h2>
          </div>
          <a className="button" target="_blank" rel="noreferrer" href={r.url}>
            Notion에서 열기 ↗
          </a>
        </div>
        <small className="muted">
          원문 수정 {localTime(r.lastEdited)} ·{" "}
          {r.complete ? "본문 수집 완료" : "본문 추가 확인 필요"}
        </small>
        {!r.owner && (
          <p className="amber">
            담당자 ID: {r.ownerIds.join(", ")} — 이름은 확인되지 않아 추정하지
            않습니다.
          </p>
        )}
        <h3>보고 기간 확인</h3>
        <p>
          {r.periodConfirmed
            ? "확인된 보고 기간입니다. 변경은 이 웹사이트에만 저장됩니다."
            : r.periodReason}
        </p>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAction(
              () => api("/reports/" + r.id, "PATCH", { start, end }),
              "보고 기간을 확인했습니다",
            );
          }}
        >
          <label>
            시작일
            <input
              required
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              required
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button disabled={busy} className="primary">
            기간 확인·저장
          </button>
        </form>
        <details className="raw">
          <summary>보고 본문 전체 보기 (수집 원문)</summary>
          <pre>{r.body}</pre>
        </details>
      </section>
      <div className="table-top">
        <h2>
          활동별 연결 검토 <span>{activities.length}</span>
        </h2>
        <small>추천은 키워드 기반 · 자동 확정 없음</small>
      </div>
      {!activities.length && (
        <Empty text="요일별 활동이 없습니다. 보고 원문을 확인하세요." />
      )}
      {activities.map((a) => (
        <ActivityCard
          key={a.id}
          activity={a}
          report={r}
          state={state}
          busy={busy}
          onAction={onAction}
          onTask={onTask}
        />
      ))}
    </>
  );
}
function ActivityCard({
  activity: a,
  report: r,
  state,
  busy,
  onAction,
  onTask,
}: {
  activity: Activity;
  report: Report;
  state: State;
  busy: boolean;
  onAction: (fn: () => Promise<any>, message?: string) => void;
  onTask: (id: string) => void;
}) {
  const [taskId, setTaskId] = useState(a.taskId || ""),
    [outside, setOutside] = useState(a.outside),
    [related, setRelated] = useState(a.relatedTaskIds || []),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/candidates/" + encodeURIComponent(a.id))
      .then(setSuggestions)
      .catch((e) => setError(e.message));
  }, [a.id, state.aliases.length]);
  return (
    <section className="panel activity-card">
      <div className="panel-heading">
        <span className="day-label">{a.day}</span>
        <span
          className={
            "badge " +
            (a.review ? "pending" : a.linkConfirmed ? "success" : "pending")
          }
        >
          {!a.active
            ? "원문에서 삭제됨 · 과거 연결 보존"
            : a.review
              ? "원문 변경 · 재검토"
              : a.linkConfirmed
                ? a.outside
                  ? "WBS 외 업무"
                  : "연결 확정"
                : "연결 미확정"}
        </span>
      </div>
      <blockquote>{a.text}</blockquote>
      {error && <p className="negative">{error}</p>}
      {!a.linkConfirmed && (
        <div className="suggestions">
          {suggestions.length ? (
            suggestions.map((s) => {
              const t = state.tasks.find((t) => t.id === s.taskId)!;
              return (
                <button
                  key={s.taskId}
                  onClick={() => {
                    setTaskId(s.taskId);
                    setOutside(false);
                  }}
                >
                  <span>추천 · {t.id}</span>
                  <b>
                    {t.product} / {t.name}
                  </b>
                  <small>{s.reasons.join(" · ")}</small>
                </button>
              );
            })
          ) : (
            <small>
              추천 후보 없음. 직접 연결하거나 WBS 외 업무로 보관하세요.
            </small>
          )}
        </div>
      )}
      <div className="link-form">
        <select
          aria-label="대표 WBS 업무"
          disabled={outside}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
        >
          <option value="">대표 WBS 업무 선택</option>
          {state.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id} · {t.product} / {t.name}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={busy || !a.active}
          onClick={() =>
            onAction(
              () =>
                api("/activities/" + encodeURIComponent(a.id), "PATCH", {
                  taskId,
                  outside,
                  relatedTaskIds: related,
                }),
              "활동 연결을 확정했습니다",
            )
          }
        >
          연결 확정
        </button>
        {a.taskId && (
          <button onClick={() => onTask(a.taskId!)}>진척률 입력 →</button>
        )}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={outside}
          onChange={(e) => setOutside(e.target.checked)}
        />
        WBS 외 업무로 보관
      </label>
      <details>
        <summary>관련 업무 추가 (집계에 중복 반영되지 않음)</summary>
        <select
          multiple
          aria-label="관련 업무"
          value={related}
          onChange={(e) =>
            setRelated([...e.target.selectedOptions].map((o) => o.value))
          }
        >
          {state.tasks
            .filter((t) => t.id !== taskId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name}
              </option>
            ))}
        </select>
      </details>
      {!r.periodConfirmed && (
        <small className="amber">
          기간 확정 전에는 주간 진행 내용에 반영하지 않습니다.
        </small>
      )}
    </section>
  );
}
function ImportReview({
  data,
  tasks,
  busy,
  onSave,
}: {
  data: any;
  tasks: Task[];
  busy: boolean;
  onSave: (tasks: any[]) => void;
}) {
  const [rows, setRows] = useState<any[]>(data.tasks),
    [selected, setSelected] = useState<Record<number, boolean>>({});
  return (
    <section className="panel">
      <h2>새 PDF 추출 후보 검토</h2>
      <p>{data.warning}</p>
      <a target="_blank" href={"/source/" + data.documentId + ".pdf"}>
        업로드 PDF 확인 ↗
      </a>
      <p>
        기존 업무를 선택하면 같은 ID로 개정합니다. 대응이 불분명하면 신규 업무로
        남기며, 기존 연결과 과거 버전은 유지합니다.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>반영</th>
              <th>페이지</th>
              <th>제품</th>
              <th>업무명</th>
              <th>기존 업무 대응</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={(e) =>
                      setSelected({ ...selected, [i]: e.target.checked })
                    }
                  />
                </td>
                <td>{r.sourcePages.join(", ")}</td>
                <td>
                  <input
                    aria-label="제품명"
                    value={r.product}
                    onChange={(e) =>
                      setRows(
                        rows.map((x, j) =>
                          j === i ? { ...x, product: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label="업무명"
                    value={r.name}
                    onChange={(e) =>
                      setRows(
                        rows.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <select
                    aria-label="기존 업무 대응"
                    value={r.targetId}
                    onChange={(e) =>
                      setRows(
                        rows.map((x, j) =>
                          j === i ? { ...x, targetId: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="">신규 / 대응 미확인</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} · {t.product} / {t.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <Empty text="자동 추출 후보가 없습니다. 지원되는 텍스트 표 PDF를 업로드해 주세요." />
      )}
      <button
        className="primary"
        disabled={busy || !Object.values(selected).some(Boolean)}
        onClick={() => onSave(rows.filter((_, i) => selected[i]))}
      >
        선택 업무를 검토 작업본에 반영
      </button>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
