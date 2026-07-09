-- ============================================================
--  OmniBridge AI — Supabase 스키마 (1b)
--  notes 테이블: 손필기 노트 클라우드 저장 + 계정별 격리(RLS)
--  실행: Supabase 대시보드 → SQL Editor → New query → 붙여넣기 → Run
--  전제: Firebase 서드파티 인증 연동(③) 후 RLS가 실제로 동작한다.
--        (auth.jwt()->>'sub' = Firebase UID)
-- ============================================================

create table if not exists public.notes (
  id          text    primary key,               -- 클라이언트가 만든 note id (기존 notesStore와 동일)
  user_id     text    not null,                  -- Firebase UID
  title       text    not null,
  style       text    not null default 'blank',
  strokes     jsonb   not null default '[]'::jsonb,
  thumbnail   text,
  created_at  bigint  not null,                  -- epoch ms
  updated_at  bigint  not null
);

-- 행 레벨 보안 활성화 (자동 RLS가 켜져 있어도 명시적으로 이중 보장)
alter table public.notes enable row level security;

-- 본인 노트만 접근 (Firebase UID = auth.jwt()->>'sub')
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
