-- ============================================================
--  OmniBridge AI — Supabase 스키마 (1b-4b)
--  notes 테이블: 손필기 노트 클라우드 저장 + 계정별 격리(RLS)
--  실행: Supabase 대시보드 → SQL Editor → New query → 붙여넣기 → Run
--  인증 = Supabase Auth. 로그인 사용자의 JWT `sub` 클레임 = auth.uid()(=user.id)이며,
--        RLS가 (auth.jwt()->>'sub' = user_id)로 본인 노트만 통과시킨다.
--        notesStore가 저장하는 user_id = getCurrentUser().id = 이 sub 값과 동일.
-- ============================================================

create table if not exists public.notes (
  id          text    primary key,               -- 클라이언트가 만든 note id (기존 notesStore와 동일)
  user_id     text    not null,                  -- Supabase Auth user.id (JWT sub)
  title       text    not null,
  style       text    not null default 'blank',
  strokes     jsonb   not null default '[]'::jsonb,
  thumbnail   text,
  created_at  bigint  not null,                  -- epoch ms
  updated_at  bigint  not null,
  deleted     boolean not null default false,    -- 소프트 삭제(tombstone) — 삭제를 기기 간 전파
  deleted_at  bigint                             -- 삭제 시각(epoch ms)
);

-- 기존 테이블에 소프트 삭제 컬럼 추가 (이미 notes를 만든 프로젝트는 이 줄만 다시 실행).
-- ※ 앱이 upsert 시 deleted/deleted_at 컬럼을 항상 포함하므로, 이 컬럼이 없으면 클라우드
--    저장이 실패한다(로컬은 보존). 이 마이그레이션을 반드시 먼저 실행할 것.
alter table public.notes add column if not exists deleted    boolean not null default false;
alter table public.notes add column if not exists deleted_at bigint;
-- PDF 노트: 페이지별 필기(jsonb). 원본 PDF 파일은 Storage(note-files 버킷)에 별도 저장.
alter table public.notes add column if not exists pdf_pages  jsonb;

-- 행 레벨 보안 활성화 (자동 RLS가 켜져 있어도 명시적으로 이중 보장)
alter table public.notes enable row level security;

-- 본인 노트만 접근 (Supabase Auth user.id = auth.jwt()->>'sub')
drop policy if exists "notes_select_own" on public.notes;
drop policy if exists "notes_insert_own" on public.notes;
drop policy if exists "notes_update_own" on public.notes;
drop policy if exists "notes_delete_own" on public.notes;

create policy "notes_select_own" on public.notes
  for select using ((auth.jwt() ->> 'sub') = user_id);

create policy "notes_insert_own" on public.notes
  for insert with check ((auth.jwt() ->> 'sub') = user_id);

create policy "notes_update_own" on public.notes
  for update using ((auth.jwt() ->> 'sub') = user_id)
             with check ((auth.jwt() ->> 'sub') = user_id);

create policy "notes_delete_own" on public.notes
  for delete using ((auth.jwt() ->> 'sub') = user_id);

-- 최신 수정순 조회 인덱스
create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

-- ============================================================
--  Storage: note-files 버킷 (PDF 원본 / 캡쳐 슬라이드 JSON)
--  버킷은 대시보드 Storage에서 Private으로 생성. 경로 <user_id>/... 로 계정 격리.
--  ※ upsert(덮어쓰기)는 UPDATE라 update 정책이 반드시 필요하다(없으면 두 번째
--    저장부터 "new row violates row-level security policy"로 실패).
-- ============================================================
create policy "note_files_own_read"   on storage.objects for select
  using (bucket_id = 'note-files' and (auth.jwt()->>'sub') = (storage.foldername(name))[1]);
create policy "note_files_own_insert" on storage.objects for insert
  with check (bucket_id = 'note-files' and (auth.jwt()->>'sub') = (storage.foldername(name))[1]);
create policy "note_files_own_update" on storage.objects for update
  using      (bucket_id = 'note-files' and (auth.jwt()->>'sub') = (storage.foldername(name))[1])
  with check (bucket_id = 'note-files' and (auth.jwt()->>'sub') = (storage.foldername(name))[1]);
create policy "note_files_own_delete" on storage.objects for delete
  using (bucket_id = 'note-files' and (auth.jwt()->>'sub') = (storage.foldername(name))[1]);
