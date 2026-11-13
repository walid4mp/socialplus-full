-- SocialPlus v1.4 — إصلاح جذري: recursion في سياسات المحادثات + قوائم المتابعين + البث
-- كل الأوامر idempotent (آمنة على قاعدة بيانات قائمة)

-- ========= 1) حل infinite recursion في conversation_members =========
-- السياسة القديمة كانت تستعلم عن نفس الجدول داخلها => recursion.
-- الحل: دالة SECURITY DEFINER تتجاوز RLS.
create or replace function public.is_conv_member(p_conv uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conv and m.user_id = p_user
  );
$$;
grant execute on function public.is_conv_member(uuid, uuid) to authenticated, anon;

drop policy if exists "members_read" on public.conversation_members;
create policy "members_read" on public.conversation_members for select
  using (public.is_conv_member(conversation_id, auth.uid()));

drop policy if exists "members_insert" on public.conversation_members;
create policy "members_insert" on public.conversation_members for insert
  with check (auth.uid() = user_id or public.is_conv_member(conversation_id, auth.uid()));

drop policy if exists "members_delete" on public.conversation_members;
create policy "members_delete" on public.conversation_members for delete
  using (auth.uid() = user_id or public.is_conv_member(conversation_id, auth.uid()));

drop policy if exists "conv_read_member" on public.conversations;
create policy "conv_read_member" on public.conversations for select
  using (public.is_conv_member(id, auth.uid()));

drop policy if exists "conv_update_member" on public.conversations;
create policy "conv_update_member" on public.conversations for update
  using (public.is_conv_member(id, auth.uid()));

drop policy if exists "messages_read_member" on public.messages;
create policy "messages_read_member" on public.messages for select
  using (public.is_conv_member(conversation_id, auth.uid()));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert with check (
  auth.uid() = sender_id
  and public.is_conv_member(conversation_id, auth.uid())
  and (
    exists (select 1 from public.conversations c where c.id = conversation_id and c.is_group)
    or exists (
      select 1 from public.conversation_members m2
      where m2.conversation_id = conversation_id and m2.user_id <> auth.uid()
        and public.can_message(auth.uid(), m2.user_id)
    )
  )
);

-- ========= 2) قائمة محادثاتي + بدء محادثة =========
create or replace function public.my_conversations()
returns table (
  id uuid, is_group boolean, title text, last_message text, updated_at timestamptz,
  other_id uuid, other_name text, other_username text, other_avatar text,
  member_count integer, unread bigint
) language sql stable security definer set search_path = public as $$
  with mine as (
    select m.conversation_id from public.conversation_members m where m.user_id = auth.uid()
  ),
  agg as (
    select c.id, c.is_group, c.title, c.last_message, c.updated_at,
      (select count(*) from public.conversation_members x where x.conversation_id = c.id) as member_count,
      (select count(*) from public.messages msg
         where msg.conversation_id = c.id and msg.sender_id <> auth.uid()
           and msg.read_at is null and msg.deleted = false) as unread
    from public.conversations c where c.id in (select conversation_id from mine)
  ),
  other as (
    select distinct on (m.conversation_id) m.conversation_id, m.user_id
    from public.conversation_members m
    where m.conversation_id in (select conversation_id from mine) and m.user_id <> auth.uid()
  )
  select a.id, a.is_group, a.title, a.last_message, a.updated_at,
    o.user_id,
    coalesce(p.full_name, p.username), p.username, p.avatar_url,
    a.member_count::int, a.unread
  from agg a
  left join other o on o.conversation_id = a.id
  left join public.profiles p on p.id = o.user_id
  order by a.updated_at desc nulls last;
$$;
grant execute on function public.my_conversations() to authenticated;

create or replace function public.start_conversation(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_conv uuid;
begin
  if v_user is null then raise exception 'auth required'; end if;
  if p_other = v_user then raise exception 'self conversation';
  end if;
  select c.id into v_conv
  from public.conversations c
  where c.is_group = false
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = v_user)
    and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = p_other)
    and (select count(*) from public.conversation_members m where m.conversation_id = c.id) = 2
  limit 1;
  if v_conv is not null then return v_conv; end if;
  insert into public.conversations (is_group) values (false) returning id into v_conv;
  insert into public.conversation_members (conversation_id, user_id) values (v_conv, v_user), (v_conv, p_other)
    on conflict do nothing;
  return v_conv;
end $$;
grant execute on function public.start_conversation(uuid) to authenticated;

-- تحديث آخر رسالة في المحادثة تلقائياً
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
    set last_message = case when new.kind = 'text' then left(new.content, 120)
                            when new.kind = 'image' then '📷 صورة'
                            when new.kind = 'video' then '🎥 فيديو'
                            when new.kind = 'voice' then '🎤 رسالة صوتية'
                            when new.kind = 'gift' then new.content
                            else coalesce(left(new.content,120),'📎 ملف') end,
        updated_at = now()
    where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists trg_touch_conversation on public.messages;
create trigger trg_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- قراءة الرسائل: mark_read موجودة في 00005، نضيف نسخة آمنة تشمل المجموعات
create or replace function public.mark_read(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update public.messages set read_at = now(), delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conv and sender_id <> auth.uid() and read_at is null;
$$;

-- ========= 3) قوائم المتابعين/المتابَعين (مع حالة المتابعة) =========
create or replace function public.follow_list(p_user uuid, p_kind text)
returns table (id uuid, username text, full_name text, avatar_url text, is_verified boolean,
               is_private boolean, is_following boolean, is_follower boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.is_verified, p.is_private,
    exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.id and f.status = 'accepted') as is_following,
    exists (select 1 from public.follows f where f.follower_id = p.id and f.following_id = auth.uid() and f.status = 'accepted') as is_follower
  from public.profiles p
  where p.id in (
    case when p_kind = 'followers'
      then (select f.follower_id from public.follows f where f.following_id = p_user and f.status = 'accepted')
      else (select f.following_id from public.follows f where f.follower_id = p_user and f.status = 'accepted')
    end
  )
  order by p.username;
$$;
grant execute on function public.follow_list(uuid, text) to authenticated;

-- ========= 4) البث المباشر: رابط تشغيل + إشعار المتابعين + قائمة البث =========
alter table public.streams add column if not exists playback_url text;
alter table public.streams add column if not exists thumbnail_url text;
alter table public.streams add column if not exists room_name text;

create or replace function public.set_stream_playback(p_stream uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.streams s where s.id = p_stream and (s.host_id = auth.uid() or public.is_admin())) then
    raise exception 'host only';
  end if;
  update public.streams set playback_url = p_url where id = p_stream;
end $$;

create or replace function public.start_stream(p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'auth required'; end if;
  update public.streams set status='ended', ended_at=coalesce(ended_at, now())
    where host_id = v_user and status = 'live';
  insert into public.streams (host_id, title, status)
    values (v_user, coalesce(nullif(p_title,''), 'بث مباشر'), 'live') returning id into v_id;
  insert into public.notifications (user_id, actor_id, kind, entity_id)
    select f.follower_id, v_user, 'live', v_id
    from public.follows f where f.following_id = v_user and f.status = 'accepted'
    and coalesce((select (notif_prefs->>'live')::boolean from public.profiles where id = f.follower_id), true)
    on conflict do nothing;
  return v_id;
end $$;
grant execute on function public.start_stream(text) to authenticated;

create or replace function public.live_streams()
returns table (id uuid, title text, viewer_count integer, coin_count integer, created_at timestamptz,
               playback_url text, host_id uuid, host_name text, host_username text, host_avatar text)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.viewer_count, s.coin_count, s.created_at, s.playback_url,
         s.host_id, coalesce(p.full_name, p.username), p.username, p.avatar_url
  from public.streams s join public.profiles p on p.id = s.host_id
  where s.status = 'live'
  order by s.created_at desc limit 50;
$$;
grant execute on function public.live_streams() to authenticated;

-- ========= 5) موسيقى القصص =========
alter table public.stories add column if not exists music_name text;
alter table public.stories add column if not exists music_url text;

-- ========= 6) مؤشرات: عدد المنشورات في الملف الشخصي عبر RPC =========
create or replace function public.profile_stats(p_user uuid)
returns table (posts bigint, followers bigint, following bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.posts x where x.user_id = p_user),
    (select count(*) from public.follows f where f.following_id = p_user and f.status='accepted'),
    (select count(*) from public.follows f where f.follower_id = p_user and f.status='accepted');
$$;
grant execute on function public.profile_stats(uuid) to authenticated, anon;

-- ========= 7) تعليقات الريلز (جدول مستقل عن منشورات) =========
create table if not exists public.reel_comments (
  id uuid primary key default uuid_generate_v4(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.reel_comments enable row level security;
drop policy if exists "reel_comments_read" on public.reel_comments;
create policy "reel_comments_read" on public.reel_comments for select using (true);
drop policy if exists "reel_comments_write" on public.reel_comments;
create policy "reel_comments_write" on public.reel_comments for insert with check (auth.uid() = user_id);
drop policy if exists "reel_comments_del" on public.reel_comments;
create policy "reel_comments_del" on public.reel_comments for delete using (auth.uid() = user_id);

create or replace function public.add_reel_comment(p_reel uuid, p_content text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_owner uuid;
begin
  if v_user is null then raise exception 'auth required'; end if;
  if p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 500 then raise exception 'bad comment'; end if;
  insert into public.reel_comments (reel_id, user_id, content) values (p_reel, v_user, btrim(p_content));
  update public.reels set comment_count = comment_count + 1 where id = p_reel;
  select user_id into v_owner from public.reels where id = p_reel;
  if v_owner is not null and v_owner <> v_user then
    insert into public.notifications (user_id, actor_id, kind, entity_id) values (v_owner, v_user, 'comment', p_reel);
  end if;
end $$;
grant execute on function public.add_reel_comment(uuid, text) to authenticated;
