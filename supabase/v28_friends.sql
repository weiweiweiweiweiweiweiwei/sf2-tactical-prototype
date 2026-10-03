-- v28 friends (Supabase project sf2-tactical). Applied as migration "v28_friends".
-- No accounts: the game registers an anonymous player once (id + random secret kept in the browser). The tables are
-- closed to the public API (RLS on, no policies); every read and write goes through the SECURITY DEFINER functions
-- below, which first check the secret — nobody can act as someone else or see anyone else's friends.

create table public.sf2_players (
  id uuid primary key default gen_random_uuid(),
  secret_hash text not null,
  code text not null unique,                       -- 8-digit friend code
  name text not null default '玩家',
  status text not null default 'hub',              -- hub | room | playing
  room text,                                       -- 6-digit room code while in an online room (shown to friends only)
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.sf2_friends (                 -- one row per pair, a < b
  a uuid not null references public.sf2_players(id) on delete cascade,
  b uuid not null references public.sf2_players(id) on delete cascade,
  requester uuid not null,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index sf2_friends_b on public.sf2_friends (b);
create table public.sf2_invites (                 -- room invites, delivered once by sf2_poll, valid 2 minutes
  id bigint generated always as identity primary key,
  to_id uuid not null references public.sf2_players(id) on delete cascade,
  from_id uuid not null references public.sf2_players(id) on delete cascade,
  room text not null,
  created_at timestamptz not null default now()
);
create index sf2_invites_to on public.sf2_invites (to_id);
create index sf2_invites_from on public.sf2_invites (from_id);

alter table public.sf2_players enable row level security;
alter table public.sf2_friends enable row level security;
alter table public.sf2_invites enable row level security;
revoke all on public.sf2_players, public.sf2_friends, public.sf2_invites from anon, authenticated;

create function public.sf2_clean_name(p text) returns text language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(btrim(regexp_replace(coalesce(p, ''), '[<>&"''`\\]', '', 'g')), ''), '玩家'), 14)
$$;

create function public.sf2_auth(p_id uuid, p_secret text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sf2_players where id = p_id and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex'))
$$;

create function public.sf2_register(p_name text) returns json language plpgsql security definer set search_path = '' as $$
declare v_secret text := encode(extensions.gen_random_bytes(24), 'hex'); v_code text; v_id uuid;
begin
  for i in 1..30 loop
    v_code := (10000000 + floor(random() * 90000000))::bigint::text;
    begin
      insert into public.sf2_players (secret_hash, code, name)
        values (encode(extensions.digest(v_secret, 'sha256'), 'hex'), v_code, public.sf2_clean_name(p_name)) returning id into v_id;
      return json_build_object('id', v_id, 'secret', v_secret, 'code', v_code);
    exception when unique_violation then null; -- that friend code is taken: draw another
    end;
  end loop;
  raise exception 'no free friend code';
end $$;

-- heartbeat + everything the friends panel shows + this player's pending room invites (removed once delivered)
create function public.sf2_poll(p_id uuid, p_secret text, p_status text, p_room text, p_name text) returns json language plpgsql security definer set search_path = '' as $$
declare v_friends json; v_invites json;
begin
  if not public.sf2_auth(p_id, p_secret) then raise exception 'sf2 auth'; end if;
  update public.sf2_players set last_seen = now(),
    status = case when p_status in ('hub', 'room', 'playing') then p_status else 'hub' end,
    room = case when p_room ~ '^[0-9]{6}$' then p_room end,
    name = case when p_name is null then name else public.sf2_clean_name(p_name) end
  where id = p_id;
  select coalesce(json_agg(json_build_object(
      'id', o.id, 'name', o.name, 'code', o.code,
      'state', case when f.accepted then 'friend' when f.requester = p_id then 'outgoing' else 'incoming' end,
      'online', f.accepted and o.last_seen > now() - interval '70 seconds',
      'st', case when f.accepted and o.last_seen > now() - interval '70 seconds' then o.status end,
      'room', case when f.accepted and o.last_seen > now() - interval '70 seconds' then o.room end) order by o.name), '[]'::json)
    into v_friends
    from public.sf2_friends f join public.sf2_players o on o.id = case when f.a = p_id then f.b else f.a end
    where f.a = p_id or f.b = p_id;
  with d as (delete from public.sf2_invites where to_id = p_id returning from_id, room, created_at)
  select coalesce(json_agg(json_build_object('from', d.from_id, 'name', p.name, 'room', d.room)), '[]'::json) into v_invites
    from d join public.sf2_players p on p.id = d.from_id where d.created_at > now() - interval '2 minutes';
  return json_build_object('friends', v_friends, 'invites', v_invites);
end $$;

create function public.sf2_add_friend(p_id uuid, p_secret text, p_code text) returns json language plpgsql security definer set search_path = '' as $$
declare v_other uuid; v_a uuid; v_b uuid; r public.sf2_friends;
begin
  if not public.sf2_auth(p_id, p_secret) then raise exception 'sf2 auth'; end if;
  select id into v_other from public.sf2_players where code = regexp_replace(coalesce(p_code, ''), '[^0-9]', '', 'g');
  if v_other is null then return json_build_object('ok', false, 'why', '找不到這個好友代碼'); end if;
  if v_other = p_id then return json_build_object('ok', false, 'why', '這是你自己的好友代碼'); end if;
  v_a := least(p_id, v_other); v_b := greatest(p_id, v_other);
  select * into r from public.sf2_friends where a = v_a and b = v_b;
  if found then
    if r.accepted then return json_build_object('ok', false, 'why', '你們已經是好友了'); end if;
    if r.requester = p_id then return json_build_object('ok', false, 'why', '已經送出邀請，等待對方確認'); end if;
    update public.sf2_friends set accepted = true where a = v_a and b = v_b; -- he had asked us: that makes us friends
    return json_build_object('ok', true, 'result', 'accepted', 'other', v_other);
  end if;
  if (select count(*) from public.sf2_friends where requester = p_id and not accepted) >= 30 then
    return json_build_object('ok', false, 'why', '等待確認的好友邀請太多了');
  end if;
  insert into public.sf2_friends (a, b, requester) values (v_a, v_b, p_id);
  return json_build_object('ok', true, 'result', 'sent', 'other', v_other);
end $$;

create function public.sf2_respond(p_id uuid, p_secret text, p_other uuid, p_accept boolean) returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.sf2_auth(p_id, p_secret) then raise exception 'sf2 auth'; end if;
  if p_accept then
    update public.sf2_friends set accepted = true where a = least(p_id, p_other) and b = greatest(p_id, p_other) and requester = p_other;
  else
    delete from public.sf2_friends where a = least(p_id, p_other) and b = greatest(p_id, p_other) and requester = p_other and not accepted;
  end if;
  return json_build_object('ok', true);
end $$;

create function public.sf2_remove_friend(p_id uuid, p_secret text, p_other uuid) returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.sf2_auth(p_id, p_secret) then raise exception 'sf2 auth'; end if;
  delete from public.sf2_friends where a = least(p_id, p_other) and b = greatest(p_id, p_other);
  return json_build_object('ok', true);
end $$;

create function public.sf2_invite(p_id uuid, p_secret text, p_to uuid, p_room text) returns json language plpgsql security definer set search_path = '' as $$
begin
  if not public.sf2_auth(p_id, p_secret) then raise exception 'sf2 auth'; end if;
  if p_room !~ '^[0-9]{6}$' then return json_build_object('ok', false, 'why', '房間代碼不正確'); end if;
  if not exists (select 1 from public.sf2_friends where a = least(p_id, p_to) and b = greatest(p_id, p_to) and accepted) then
    return json_build_object('ok', false, 'why', '只能邀請好友');
  end if;
  delete from public.sf2_invites where from_id = p_id and to_id = p_to;          -- one pending invite per friend
  delete from public.sf2_invites where created_at < now() - interval '10 minutes'; -- old, never delivered
  insert into public.sf2_invites (to_id, from_id, room) values (p_to, p_id, p_room);
  return json_build_object('ok', true);
end $$;

create function public.sf2_bye(p_id uuid, p_secret text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.sf2_auth(p_id, p_secret) then update public.sf2_players set last_seen = now() - interval '1 hour', room = null where id = p_id; end if;
end $$;

revoke execute on function public.sf2_auth(uuid, text) from public, anon, authenticated;
revoke execute on function public.sf2_clean_name(text) from public, anon, authenticated;
revoke execute on function public.sf2_register(text), public.sf2_poll(uuid, text, text, text, text), public.sf2_add_friend(uuid, text, text),
  public.sf2_respond(uuid, text, uuid, boolean), public.sf2_remove_friend(uuid, text, uuid), public.sf2_invite(uuid, text, uuid, text), public.sf2_bye(uuid, text) from public;
grant execute on function public.sf2_register(text), public.sf2_poll(uuid, text, text, text, text), public.sf2_add_friend(uuid, text, text),
  public.sf2_respond(uuid, text, uuid, boolean), public.sf2_remove_friend(uuid, text, uuid), public.sf2_invite(uuid, text, uuid, text), public.sf2_bye(uuid, text) to anon, authenticated;
