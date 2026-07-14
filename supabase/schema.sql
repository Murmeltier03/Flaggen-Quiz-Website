-- Flaggenfieber schema
-- Run once in Supabase Dashboard → SQL Editor, then add the Vercel environment variables.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 24),
  normalized_name text not null unique,
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  victories integer not null default 0 check (victories >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_profile_id uuid not null references public.profiles(id),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished')),
  seconds_per_round smallint not null check (seconds_per_round between 8 and 45),
  target_score smallint not null check (target_score between 100 and 500),
  current_round integer not null default 0 check (current_round >= 0),
  current_country_code text,
  round_started_at timestamptz,
  round_ends_at timestamptz,
  winner_profile_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_players (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  score integer not null default 0 check (score >= 0),
  joined_at timestamptz not null default now(),
  primary key (game_id, profile_id)
);

create table if not exists public.rounds (
  game_id uuid not null references public.games(id) on delete cascade,
  round_no integer not null check (round_no > 0),
  country_code text not null check (country_code ~ '^[a-z]{2}$'),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  primary key (game_id, round_no)
);

create table if not exists public.round_answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  round_no integer not null,
  profile_id uuid not null references public.profiles(id),
  country_code text not null check (country_code ~ '^[a-z]{2}$'),
  rank smallint not null default 0 check (rank >= 0),
  points_awarded smallint not null default 0 check (points_awarded between 0 and 10),
  submitted_at timestamptz not null default now(),
  unique (game_id, round_no, profile_id),
  foreign key (game_id, round_no) references public.rounds(game_id, round_no) on delete cascade,
  foreign key (game_id, profile_id) references public.game_players(game_id, profile_id) on delete cascade
);

create index if not exists game_players_score_idx on public.game_players(game_id, score desc);
create index if not exists round_answers_order_idx on public.round_answers(game_id, round_no, rank);
create index if not exists games_code_idx on public.games(code);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prepare_round_answer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  game_row public.games%rowtype;
begin
  select * into game_row
  from public.games
  where id = new.game_id
  for update;

  if game_row.id is null or game_row.status <> 'active' then
    raise exception 'No active game';
  end if;
  if new.round_no <> game_row.current_round or new.country_code <> game_row.current_country_code then
    raise exception 'Answer does not match current round';
  end if;
  if clock_timestamp() > game_row.round_ends_at then
    raise exception 'Round has ended';
  end if;

  select count(*) + 1 into new.rank
  from public.round_answers
  where game_id = new.game_id and round_no = new.round_no;
  new.points_awarded := greatest(1, 11 - new.rank);
  new.submitted_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.apply_round_score()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_score integer;
  target integer;
begin
  update public.game_players
  set score = score + new.points_awarded
  where game_id = new.game_id and profile_id = new.profile_id
  returning score into new_score;

  update public.profiles
  set lifetime_points = lifetime_points + new.points_awarded
  where id = new.profile_id;

  select target_score into target from public.games where id = new.game_id;
  if new_score >= target then
    update public.games
    set status = 'finished', winner_profile_id = new.profile_id
    where id = new.game_id and status <> 'finished';
  end if;
  return new;
end;
$$;

create or replace function public.finalize_game_stats()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'finished' and new.status = 'finished' then
    update public.profiles p
    set games_played = games_played + 1,
        victories = victories + case when p.id = new.winner_profile_id then 1 else 0 end
    where p.id in (
      select gp.profile_id from public.game_players gp where gp.game_id = new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists games_updated_at on public.games;
create trigger games_updated_at before update on public.games
for each row execute function public.set_updated_at();

drop trigger if exists round_answer_prepare on public.round_answers;
create trigger round_answer_prepare before insert on public.round_answers
for each row execute function public.prepare_round_answer();

drop trigger if exists round_answer_score on public.round_answers;
create trigger round_answer_score after insert on public.round_answers
for each row execute function public.apply_round_score();

drop trigger if exists game_stats_finalize on public.games;
create trigger game_stats_finalize after update of status on public.games
for each row execute function public.finalize_game_stats();

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_answers enable row level security;

-- Browser clients receive no direct table access. All reads and writes go through
-- validated Next.js route handlers using the server-only service role key.
revoke all on public.profiles from anon, authenticated;
revoke all on public.games from anon, authenticated;
revoke all on public.game_players from anon, authenticated;
revoke all on public.rounds from anon, authenticated;
revoke all on public.round_answers from anon, authenticated;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.games to service_role;
grant select, insert, update, delete on public.game_players to service_role;
grant select, insert, update, delete on public.rounds to service_role;
grant select, insert, update, delete on public.round_answers to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prepare_round_answer() from public, anon, authenticated;
revoke all on function public.apply_round_score() from public, anon, authenticated;
revoke all on function public.finalize_game_stats() from public, anon, authenticated;
