# PPS 주간 진척 대시보드 · Vercel + Supabase

React/TypeScript 화면, Vercel Node 서버 함수, Supabase PostgreSQL 및 **비공개 Storage**로 구성한 내부 업무용 MVP입니다. 공개 Git 저장소에는 코드와 가상 테스트 자료만 있습니다. 회사 WBS PDF, 업무보고 원문, 비밀 키는 포함하지 않습니다.

## 배포 순서

### 1. Supabase 준비

1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/migrations/001_workspace.sql`을 실행합니다.
3. Project URL과 서버용 `service_role` 키를 확인합니다. 이 키는 Vercel 서버 환경변수에만 넣습니다.
4. SQL은 DB 상태 테이블과 `pps-private` 비공개 버킷을 준비합니다. anon/authenticated 사용자의 DB·파일 직접 접근을 허용하지 않습니다.

### 2. Vercel 연결

1. Vercel → Add New → Project → 이 GitHub 저장소를 Import합니다.
2. **배포할 브랜치:** 운영 배포는 `main`, PR 검토용 Preview는 작업 브랜치
3. **Root Directory:** 기본값 `./`를 사용해도 됩니다. 기존 프로젝트가 `pps-dashboard`로 설정되어 있어도 지원합니다.
4. **Framework Preset:** Other, **Node.js:** 24.x
5. **Build Command:** `npm run build`. Output Directory는 Root가 `./`이면 `pps-dashboard/dist`, Root가 `pps-dashboard`이면 `dist`입니다. 해당 `vercel.json`의 기본값을 사용하세요.
6. 아래 환경변수를 등록하고 Deploy합니다. 빌드/라우팅/60초 함수 제한은 `vercel.json`에 포함되어 있습니다.

| 환경변수 | 값 |
|---|---|
| `SUPABASE_URL` | Supabase Project URL (`https://…supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 service_role 비밀 키 |
| `SUPABASE_STORAGE_BUCKET` | `pps-private` |
| `ADMIN_USER` | 관리자 로그인 이름 |
| `ADMIN_PASSWORD` | 관리자가 정한 12자 이상 비밀번호 |
| `SESSION_SECRET` | 무작위 32자 이상 비밀 문자열 |
| `NOTION_TOKEN` | 운영용 Notion 통합 비밀 키. 동기화 시 필요 |
| `NOTION_DATA_SOURCE_ID` | 동기화할 Notion 데이터 소스 UUID |

환경변수는 **VITE_ 접두사 없이** 설정하세요. 비밀 값은 GitHub, 화면 코드, 채팅에 입력하지 않습니다. Preview와 Production 환경을 구분하고 회사 데이터를 쓰는 프로젝트에는 Vercel Deployment Protection도 적용하세요. 로그인하지 않으면 운영 API와 PDF를 읽을 수 없습니다. Supabase는 서버 API를 통해서만 사용합니다.

Vercel 프로젝트 Import는 기본 브랜치를 선택할 수 있습니다. PR 브랜치를 배포하려면 Git 연결 후 해당 브랜치의 Preview 배포를 선택하거나 Production Branch 설정을 해당 브랜치로 바꾸세요. main 병합은 별도 검토 후 진행합니다.

### 3. 실제 데이터 넣기

기본 배포는 **빈 워크스페이스**입니다. 회사 자료를 공개 저장소에 넣지 않습니다.

기존 작업에서 보관한 `seed-wbs.json`, `seed-notion.json`, `assets/` 폴더가 있는 비공개 자료 디렉터리를 준비하고, 로컬의 `.env`에 서버용 Supabase 변수를 설정한 뒤 실행합니다.

```bash
npm ci
npm run import:private -- /absolute/path/to/private-source-directory
```

이관 스크립트는 PDF와 페이지 이미지를 비공개 버킷에 업로드하고 WBS·보고를 DB에 저장합니다. 기존 업무를 덮어쓰지 않으며, 기존 보고 연결과 보정 기간을 유지합니다. 동시 변경이 감지되면 저장을 거절하므로 다시 실행하면 됩니다. 기존 소스 자료는 `private-data/`나 저장소 외부에만 보관하세요.

노션 전체 보고는 웹앱에서 **노션 동기화**를 실행해 읽어옵니다. 원본 DB나 페이지에 쓰지 않습니다.

## 사용자 흐름

1. WBS 관리에서 원본 PDF를 검토하고 가정 일자와 담당자를 수정합니다. 원문 이름은 별칭 확인 전 자동 변경하지 않습니다.
2. 일정 확인 후 작업본 저장 → 기준 버전 적용일·이름 입력 → 기준 버전 확정.
3. 날짜 없는 보고는 제안 기간을 검토·확정합니다.
4. 보고 활동을 대표 WBS 업무 하나에 연결합니다. 관련 업무는 별도로 표시하며 중복 집계하지 않습니다.
5. 업무 상세에서 직접 확인한 **누적 실제 진척률**과 수치 기준일·근거를 입력합니다.
6. 주차 종료일을 선택해 계획·실제·차이·전주 대비·확인 비율을 확인합니다.

미확인 실제는 0%가 아닙니다. AI 수치는 공식 계산에 포함하지 않습니다. 미래 기준일과 미래 보고의 수치는 과거 집계에서 제외합니다. 과거 기준일 수동 입력은 과거 집계 정정으로 기록하며 실제 확정 시각도 보존합니다. 요약은 전체 업무 기준, 필터는 상세 표 기준입니다.

## 서버리스에 맞춘 변경

- 로컬 SQLite와 로컬 업로드 파일을 제거했습니다. 함수 인스턴스가 바뀌어도 Supabase에서 기록을 읽습니다.
- 요청마다 DB 상태를 읽고, 수정은 PostgreSQL RPC의 **버전 비교 후 원자적 저장**으로 처리합니다. 다른 요청이 먼저 저장한 경우 409를 반환하고 덮어쓰지 않습니다.
- MVP는 `pps_state`의 JSONB 상태 한 개를 사용합니다. 사용자·업무·이력은 내부 종류별로 분리됩니다. 대용량 다중 팀 운영으로 확장 시 개별 관계형 테이블로 분리하는 것이 후속 작업입니다.
- 세션은 해시 형태로 Supabase에 저장됩니다. 로그인 시도 제한도 서버 인스턴스와 무관하게 유지됩니다. 인증·DB 설정이 없으면 회사 데이터 API는 차단됩니다.
- 노션 동기화는 **호출당 한 번의 원격 조회**만 수행합니다. 보고 페이지·블록 커서와 중첩 블록 대기열을 Supabase에 저장하고, 브라우저가 다음 호출을 이어갑니다. 탭을 닫으면 멈추며 다음 방문에 재개됩니다. 실행 제한으로 응답이 중단돼도 같은 단계를 재시도할 수 있습니다. 무인 스케줄러는 미구현입니다.
- PDF 후보 추출은 `unpdf`를 사용해 Node에서 실행합니다. Python과 별도 추출 서버가 필요하지 않습니다.
- 웹 업로드 PDF는 JSON/base64 요청을 고려해 **2.5MB 이하**로 제한합니다. 큰 원본은 비공개 이관 스크립트로 올립니다. 비공개 버킷 파일의 기본 상한은 10MB입니다.
- PDF 표 후보 추출은 기존 표 양식에 맞춘 휴리스틱입니다. 임의 PDF의 OCR·간트 막대 자동 판독은 제공하지 않습니다. 일정은 사용자가 원본을 보고 확정해야 합니다.

## 로컬 개발과 검증

```bash
npm ci
cp .env.example .env
# .env를 로컬에서 편집한 뒤
npm run build
npm start
npm test
```

접속 주소는 **서버를 실행한 컴퓨터의** `http://127.0.0.1:3000`입니다. 원격 컴퓨터에서 서버를 실행했다면 이 주소가 사용자 PC의 서버 주소가 되지 않습니다. Vercel 배포 후에는 발급된 HTTPS URL을 사용하세요.

테스트는 가상 Supabase/Notion 응답으로 인증·영속 저장·동시 저장 충돌·누적 계산·주차 필터·중복 방지·분할 수집을 검증합니다. 실 Supabase 프로젝트와 Vercel 배포 확인은 실제 환경변수 설정 후 별도로 필요합니다. 브라우저 시각 E2E는 수행하지 않았습니다.

## 구조

- `src/`: 대시보드 / WBS 관리 / 보고 연결 / 설정
- `api/index.ts`: Vercel 서버 함수 진입점
- `server/index.ts`: 로그인·보호 API·비공개 파일 프록시
- `server/supabase.ts`: 서버 전용 DB/Storage 및 요청 단위 저장
- `server/model.ts`, `reports.ts`: 주간 계산 / 보고 연결·이력
- `server/notion.ts`: 커서 기반 노션 읽기 전용 수집
- `server/pdf.ts`: Node PDF 후보 추출
- `supabase/migrations/001_workspace.sql`: RLS·RPC·비공개 버킷
- `scripts/import-private-data.ts`: 로컬 비공개 자료 이관 도구

AI API·개별 직원 SSO·세부 업무 가중 완료 산정은 연결하지 않았습니다. 단일 관리자 인증을 사용합니다.

## 운영 주소에서 404가 날 때

PR Preview 성공과 운영 도메인 배포는 별개입니다. Vercel Production Branch를 `main`으로 설정하고 앱 변경이 main에 반영되었는지 확인하세요. Root Directory 기본값 `./`와 `pps-dashboard`를 모두 지원합니다. 설정을 변경한 경우 main 최신 커밋으로 Redeploy해야 합니다.
