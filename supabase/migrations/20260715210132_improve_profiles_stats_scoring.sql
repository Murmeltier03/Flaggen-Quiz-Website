-- Improve profile avatar allocation and make answer timing/scoring authoritative
-- inside Postgres. The rebalance is deliberately migration-only: it fixes
-- existing collisions once, while new accounts use create_or_get_profile().

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'round_answers'
      and column_name = 'reaction_ms'
  ) then
    with shuffled_profiles as (
      select
        p.id,
        row_number() over (order by random(), p.id) as position
      from public.profiles p
    ),
    avatar_pool as (
      select array[
        'fox', 'bear', 'rabbit', 'panda', 'cat', 'dog', 'raccoon', 'otter', 'red-panda', 'koala',
        'hedgehog', 'deer', 'tiger', 'lion', 'penguin', 'owl', 'frog', 'capybara', 'hamster', 'alpaca'
      ]::text[] as avatar_ids
    )
    update public.profiles p
    set avatar_id = pool.avatar_ids[(((shuffled.position - 1) % 20) + 1)::integer]
    from shuffled_profiles shuffled
    cross join avatar_pool pool
    where p.id = shuffled.id;
  end if;
end $$;

alter table public.round_answers
  add column if not exists reaction_ms integer not null default 0;
alter table public.round_answers
  add column if not exists speed_percent smallint not null default 100;
alter table public.round_answers
  alter column submitted_at set default clock_timestamp();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'round_answers_reaction_ms_check'
      and conrelid = 'public.round_answers'::regclass
  ) then
    alter table public.round_answers
      add constraint round_answers_reaction_ms_check check (reaction_ms >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'round_answers_speed_percent_check'
      and conrelid = 'public.round_answers'::regclass
  ) then
    alter table public.round_answers
      add constraint round_answers_speed_percent_check check (speed_percent in (20, 40, 60, 80, 100));
  end if;
end $$;

create index if not exists profiles_leaderboard_idx
  on public.profiles(lifetime_points desc, victories desc, created_at);
create index if not exists round_answers_arrival_idx
  on public.round_answers(game_id, round_no, submitted_at, id);

create or replace function public.prepare_round_answer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  game_row public.games%rowtype;
  received_at timestamptz;
begin
  received_at := coalesce(new.submitted_at, clock_timestamp());

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
  if game_row.round_started_at is null or game_row.round_ends_at is null then
    raise exception 'Round timing is missing';
  end if;
  if received_at > game_row.round_ends_at then
    raise exception 'Round has ended';
  end if;

  update public.round_answers ra
  set rank = (ra.rank + 1)::smallint
  where ra.game_id = new.game_id
    and ra.round_no = new.round_no
    and (ra.submitted_at, ra.id) > (received_at, new.id);

  select count(*) + 1 into new.rank
  from public.round_answers ra
  where ra.game_id = new.game_id
    and ra.round_no = new.round_no
    and (ra.submitted_at, ra.id) <= (received_at, new.id);

  new.reaction_ms := greatest(
    0,
    ceil(extract(epoch from (received_at - game_row.round_started_at)) * 1000)::integer
  );
  new.speed_percent := case
    when received_at <= game_row.round_started_at + interval '3 seconds' then 100
    when received_at <= game_row.round_started_at + interval '6 seconds' then 80
    when received_at <= game_row.round_started_at + interval '9 seconds' then 60
    when received_at <= game_row.round_started_at + interval '12 seconds' then 40
    else 20
  end;
  new.points_awarded := (new.speed_percent / 10)::smallint;
  new.submitted_at := received_at;
  return new;
end;
$$;

create or replace function public.create_or_get_profile(
  p_display_name text,
  p_normalized_name text
)
returns setof public.profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clean_display_name text := btrim(p_display_name);
  clean_normalized_name text := btrim(p_normalized_name);
  selected_avatar text;
begin
  if clean_display_name is null or char_length(clean_display_name) not between 2 and 24 then
    raise exception 'Display name must contain between 2 and 24 characters';
  end if;
  if clean_normalized_name is null or clean_normalized_name = '' then
    raise exception 'Normalized name must not be empty';
  end if;

  return query
  select p.*
  from public.profiles p
  where p.normalized_name = clean_normalized_name
  limit 1;
  if found then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(485968303212543766::bigint);

  return query
  select p.*
  from public.profiles p
  where p.normalized_name = clean_normalized_name
  limit 1;
  if found then
    return;
  end if;

  with avatars(avatar_id) as (
    values
      ('fox'), ('bear'), ('rabbit'), ('panda'), ('cat'),
      ('dog'), ('raccoon'), ('otter'), ('red-panda'), ('koala'),
      ('hedgehog'), ('deer'), ('tiger'), ('lion'), ('penguin'),
      ('owl'), ('frog'), ('capybara'), ('hamster'), ('alpaca')
  )
  select a.avatar_id
  into selected_avatar
  from avatars a
  left join public.profiles p on p.avatar_id = a.avatar_id
  group by a.avatar_id
  order by count(p.id), random()
  limit 1;

  begin
    return query
    insert into public.profiles as p (display_name, normalized_name, avatar_id)
    values (clean_display_name, clean_normalized_name, selected_avatar)
    returning p.*;
    return;
  exception
    when unique_violation then
      return query
      select p.*
      from public.profiles p
      where p.normalized_name = clean_normalized_name
      limit 1;
      return;
  end;
end;
$$;

create or replace function public.start_game_round(
  p_game_code text,
  p_profile_id uuid,
  p_country_code text,
  p_expected_round integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  game_row public.games%rowtype;
  new_round_no integer;
  v_round_started_at timestamptz;
  v_round_ends_at timestamptz;
  normalized_code text := upper(btrim(p_game_code));
  normalized_country_code text := lower(btrim(p_country_code));
begin
  if normalized_country_code is null or normalized_country_code !~ '^[a-z]{2}$' then
    raise exception 'Country code must contain two lowercase letters';
  end if;

  select g.*
  into game_row
  from public.games g
  where g.code = normalized_code
  for update;

  if game_row.id is null then
    raise exception 'Game not found';
  end if;
  if game_row.host_profile_id is distinct from p_profile_id then
    raise exception 'Only the host can start a round' using errcode = '42501';
  end if;
  if game_row.status = 'finished' then
    return false;
  end if;
  if p_expected_round is not null and game_row.current_round <> p_expected_round then
    return false;
  end if;
  if game_row.round_ends_at is not null and game_row.round_ends_at > clock_timestamp() then
    return false;
  end if;

  new_round_no := game_row.current_round + 1;
  v_round_started_at := clock_timestamp();
  v_round_ends_at := v_round_started_at + game_row.seconds_per_round * interval '1 second';

  insert into public.rounds (game_id, round_no, country_code, started_at, ends_at)
  values (game_row.id, new_round_no, normalized_country_code, v_round_started_at, v_round_ends_at);

  update public.games
  set status = 'active',
      current_round = new_round_no,
      current_country_code = normalized_country_code,
      round_started_at = v_round_started_at,
      round_ends_at = v_round_ends_at
  where id = game_row.id;

  return true;
end;
$$;

create or replace function public.submit_game_answer(
  p_game_code text,
  p_profile_id uuid,
  p_country_code text
)
returns table (
  is_correct boolean,
  is_expired boolean,
  is_duplicate boolean,
  answer_rank smallint,
  answer_points smallint,
  answer_speed_percent smallint,
  answer_reaction_ms integer,
  answer_submitted_at timestamptz,
  answer_display_name text,
  answer_avatar_id text,
  server_time timestamptz,
  player_score integer,
  game_status text,
  winner_profile_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  accepted_at timestamptz := clock_timestamp();
  normalized_code text := upper(btrim(p_game_code));
  normalized_country_code text := lower(btrim(p_country_code));
  game_row public.games%rowtype;
  existing_answer public.round_answers%rowtype;
  inserted_answer public.round_answers%rowtype;
begin
  select g.*
  into game_row
  from public.games g
  where g.code = normalized_code
  for update;

  if game_row.id is null then
    raise exception 'Game not found';
  end if;

  select gp.score, p.display_name, p.avatar_id
  into player_score, answer_display_name, answer_avatar_id
  from public.game_players gp
  join public.profiles p on p.id = gp.profile_id
  where gp.game_id = game_row.id
    and gp.profile_id = p_profile_id;

  if not found then
    raise exception 'Player is not part of this game' using errcode = '42501';
  end if;

  game_status := game_row.status;
  winner_profile_id := game_row.winner_profile_id;
  server_time := accepted_at;
  is_duplicate := false;

  if game_row.current_round > 0 then
    select ra.*
    into existing_answer
    from public.round_answers ra
    where ra.game_id = game_row.id
      and ra.round_no = game_row.current_round
      and ra.profile_id = p_profile_id;

    if found then
      is_correct := true;
      is_expired := false;
      is_duplicate := true;
      answer_rank := existing_answer.rank;
      answer_points := existing_answer.points_awarded;
      answer_speed_percent := existing_answer.speed_percent;
      answer_reaction_ms := existing_answer.reaction_ms;
      answer_submitted_at := existing_answer.submitted_at;
      return next;
      return;
    end if;
  end if;

  if game_row.status <> 'active' or game_row.round_started_at is null or game_row.round_ends_at is null then
    is_correct := false;
    is_expired := game_row.status = 'finished';
    return next;
    return;
  end if;

  if accepted_at > game_row.round_ends_at then
    is_correct := false;
    is_expired := true;
    return next;
    return;
  end if;

  if normalized_country_code is distinct from game_row.current_country_code then
    is_correct := false;
    is_expired := false;
    return next;
    return;
  end if;

  insert into public.round_answers (
    game_id,
    round_no,
    profile_id,
    country_code,
    submitted_at
  )
  values (
    game_row.id,
    game_row.current_round,
    p_profile_id,
    normalized_country_code,
    accepted_at
  )
  returning * into inserted_answer;

  select gp.score, g.status, g.winner_profile_id
  into player_score, game_status, winner_profile_id
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where gp.game_id = game_row.id
    and gp.profile_id = p_profile_id;

  is_correct := true;
  is_expired := false;
  answer_rank := inserted_answer.rank;
  answer_points := inserted_answer.points_awarded;
  answer_speed_percent := inserted_answer.speed_percent;
  answer_reaction_ms := inserted_answer.reaction_ms;
  answer_submitted_at := inserted_answer.submitted_at;
  return next;
  return;
end;
$$;

revoke all on function public.create_or_get_profile(text, text) from public, anon, authenticated;
revoke all on function public.start_game_round(text, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.submit_game_answer(text, uuid, text) from public, anon, authenticated;

grant execute on function public.create_or_get_profile(text, text) to service_role;
grant execute on function public.start_game_round(text, uuid, text, integer) to service_role;
grant execute on function public.submit_game_answer(text, uuid, text) to service_role;
