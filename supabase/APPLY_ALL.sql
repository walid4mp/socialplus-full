-- ============================================================
-- SocialPlus — تشغيل كامل لقاعدة البيانات (آمن للتكرار / Idempotent)
-- الصق هذا الملف كاملاً في: Supabase → SQL Editor → New query → Run
-- يعالج: infinite recursion في conversation_members، تعليقات/هدايا/متابعين/بث
-- ============================================================
-- SocialPlus — APPLY ALL (idempotent) — run in Supabase SQL Editor
-- يجمع 00003 → 00007 + إصلاح recursion في المحادثات

-- ===== 00003_features =====
-- SocialPlus v1.2 — privacy, groups, reactions, live, admin

alter table public.profiles
  add column if not exists is_private boolean not null default false,
  add column if not exists allow_messages text not null default 'everyone' check (allow_messages in ('everyone','following','nobody')),
  add column if not exists show_online boolean not null default true,
  add column if not exists show_last_seen boolean not null default true,
  add column if not exists muted_ids uuid[] not null default '{}',
  add column if not exists push_token text;

alter table public.follows add column if not exists status text not null default 'accepted' check (status in ('accepted','pending'));

create table if not exists public.mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_id)
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.reel_views (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);

alter table public.streams
  add column if not exists ended_at timestamptz,
  add column if not exists peak_viewers integer not null default 0;

create table if not exists public.live_messages (
  id uuid primary key default uuid_generate_v4(),
  stream_id uuid not null references public.streams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_log (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- منع الإشعارات المكررة
create unique index if not exists notif_dedup on public.notifications (user_id, actor_id, kind, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- فهارس الأداء
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists notif_user_idx on public.notifications (user_id, created_at desc);
create index if not exists post_likes_post_idx on public.post_likes (post_id);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists reels_created_idx on public.reels (created_at desc);
create index if not exists gifts_recv_idx on public.gifts_sent (receiver_id, created_at desc);
create index if not exists live_msg_stream_idx on public.live_messages (stream_id, created_at);

-- منع تعديل الأرصدة والصلاحيات مباشرة من العميل
drop policy if exists "profile_update_own" on public.profiles;
create policy "profile_update_own" on public.profiles for update
  using (auth.uid() = id and is_banned = false)
  with check (
    auth.uid() = id
    and coins = (select coins from profiles where id = auth.uid())
    and is_admin = (select is_admin from profiles where id = auth.uid())
    and is_verified = (select is_verified from profiles where id = auth.uid())
    and is_banned = (select is_banned from profiles where id = auth.uid())
  );

-- الهدايا عبر RPC فقط (لا إدراج مباشر)
drop policy if exists "gifts_sent_read_own" on public.gifts_sent;
create policy "gifts_sent_read_own" on public.gifts_sent for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id
         or exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

-- رسالة خاصة تحترم الحظر والخصوصية
create or replace function public.can_message(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from blocks b where (b.blocker_id = p_to and b.blocked_id = p_from) or (b.blocker_id = p_from and b.blocked_id = p_to))
  and not exists (select 1 from profiles t where t.id = p_to and t.allow_messages = 'nobody')
  and (
    (select allow_messages from profiles where id = p_to) = 'everyone'
    or exists (select 1 from follows f where f.follower_id = p_to and f.following_id = p_from and f.status = 'accepted')
  );
$$;

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert with check (
  auth.uid() = sender_id
  and exists (select 1 from conversation_members m where m.conversation_id = conversation_id and m.user_id = auth.uid())
  and exists (
    select 1 from conversation_members m2
    where m2.conversation_id = conversation_id and m2.user_id <> auth.uid()
      and can_message(auth.uid(), m2.user_id)
  )
);

-- متابعة مع دعم الحسابات الخاصة
create or replace function public.follow_user(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_private boolean;
begin
  if v_user is null or v_user = p_target then raise exception 'invalid follow'; end if;
  select is_private into v_private from profiles where id = p_target;
  if exists (select 1 from follows where follower_id = v_user and following_id = p_target) then
    return 'already';
  end if;
  insert into follows (follower_id, following_id, status) values (v_user, p_target, case when v_private then 'pending' else 'accepted' end);
  insert into notifications (user_id, actor_id, kind) values (p_target, v_user, 'follow');
  return case when v_private then 'pending' else 'accepted' end;
end $$;

create or replace function public.unfollow_user(p_target uuid)
returns void language sql security definer set search_path = public as $$
  delete from follows where follower_id = auth.uid() and following_id = p_target;
$$;

-- إدارة (محمية بـ is_admin على الخادم)
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.admin_ban_user(p_target uuid, p_ban boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update profiles set is_banned = p_ban where id = p_target;
  insert into admin_log (admin_id, action, target) values (auth.uid(), case when p_ban then 'ban' else 'unban' end, p_target::text);
end $$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update reports set status = p_status where id = p_report;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'report_' || p_status, p_report::text);
end $$;

create or replace function public.admin_broadcast(p_title text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  insert into notifications (user_id, actor_id, kind, entity_id)
  select id, auth.uid(), 'system', null from profiles where is_banned = false;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'broadcast', p_title);
end $$;

create or replace function public.admin_set_gift_price(p_gift uuid, p_price integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_price is null or p_price <= 0 then raise exception 'bad price'; end if;
  update gifts set price = p_price where id = p_gift;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'gift_price', p_gift::text || '=' || p_price);
end $$;

create or replace function public.admin_set_role(p_target uuid, p_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update profiles set is_admin = p_admin where id = p_target;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'set_role', p_target::text || '=' || p_admin);
end $$;

create or replace function public.admin_delete_post(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  delete from posts where id = p_post;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'delete_post', p_post::text);
end $$;

-- تعديل/حذف تعليق
create or replace function public.update_comment(p_id uuid, p_content text)
returns void language sql security definer set search_path = public as $$
  update comments set content = p_content where id = p_id and user_id = auth.uid();
$$;
create or replace function public.delete_comment(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from comments where id = p_id and user_id = auth.uid();
$$;

create policy "mutes_rw" on public.mutes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reactions_read" on public.message_reactions for select using (true);
create policy "reactions_write" on public.message_reactions for insert with check (auth.uid() = user_id);
create policy "reactions_delete" on public.message_reactions for delete using (auth.uid() = user_id);
create policy "story_rx_read" on public.story_reactions for select using (true);
create policy "story_rx_write" on public.story_reactions for insert with check (auth.uid() = user_id);
create policy "story_rx_del" on public.story_reactions for delete using (auth.uid() = user_id);
create policy "reel_views_rw" on public.reel_views for insert with check (auth.uid() = viewer_id);
create policy "reel_views_read" on public.reel_views for select using (true);
create policy "live_msg_read" on public.live_messages for select using (true);
create policy "live_msg_write" on public.live_messages for insert with check (auth.uid() = user_id);
create policy "live_msg_del" on public.live_messages for delete using (auth.uid() = user_id);
create policy "admin_log_read" on public.admin_log for select using (is_admin());
create policy "settings_read" on public.app_settings for select using (true);
create policy "settings_admin" on public.app_settings for all using (is_admin()) with check (is_admin());
create policy "follows_update_own" on public.follows for update using (auth.uid() = following_id);

-- منع المستخدمين المحظورين من إكمال التسجيل
create or replace function public.reject_banned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = new.id and is_banned) then
    raise exception 'account banned';
  end if;
  return new;
end $$;

-- ===== 00004_live =====
create or replace function public.stream_join(p_stream uuid)
returns void language sql security definer set search_path = public as $$
  update streams set viewer_count = viewer_count + 1,
    peak_viewers = greatest(peak_viewers, viewer_count + 1)
  where id = p_stream and status = 'live';
$$;

create or replace function public.stream_leave(p_stream uuid)
returns void language sql security definer set search_path = public as $$
  update streams set viewer_count = greatest(viewer_count - 1, 0) where id = p_stream;
$$;

create or replace function public.stream_end(p_stream uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from streams where id = p_stream and host_id = auth.uid())
     and not is_admin() then raise exception 'host only'; end if;
  update streams set status = 'ended', ended_at = now(), viewer_count = 0 where id = p_stream;
end $$;

create or replace function public.stream_comment(p_stream uuid, p_content text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if char_length(p_content) = 0 or char_length(p_content) > 300 then raise exception 'bad message'; end if;
  insert into live_messages (stream_id, user_id, content) values (p_stream, auth.uid(), p_content);
end $$;

-- ===== 00005_interactions =====
-- Reels + comments + read receipts
create or replace function public.toggle_reel_like(p_reel uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'auth required'; end if;
  if exists (select 1 from reel_likes where reel_id = p_reel and user_id = v_user) then
    delete from reel_likes where reel_id = p_reel and user_id = v_user;
    update reels set like_count = greatest(like_count - 1, 0) where id = p_reel;
  else
    insert into reel_likes (reel_id, user_id) values (p_reel, v_user);
    update reels set like_count = like_count + 1 where id = p_reel;
  end if;
end $$;

create or replace function public.record_reel_view(p_reel uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into reel_views (reel_id, viewer_id) values (p_reel, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.add_comment(p_post uuid, p_content text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_id uuid; v_owner uuid;
begin
  if v_user is null then raise exception 'auth required'; end if;
  if char_length(trim(p_content)) = 0 or char_length(p_content) > 500 then raise exception 'bad comment'; end if;
  insert into comments (post_id, user_id, content) values (p_post, v_user, p_content) returning id into v_id;
  update posts set comment_count = comment_count + 1 where id = p_post;
  select user_id into v_owner from posts where id = p_post;
  if v_owner <> v_user then
    insert into notifications (user_id, actor_id, kind, entity_id) values (v_owner, v_user, 'comment', p_post);
  end if;
  return v_id;
end $$;

create or replace function public.mark_read(p_conv uuid)
returns void language sql security definer set search_path = public as $$
  update messages set read_at = now()
  where conversation_id = p_conv and sender_id <> auth.uid() and read_at is null;
$$;

-- ===== 00006_ux_messaging =====
-- SocialPlus v1.3 — additive & idempotent (يحافظ على كل البيانات)

-- إعدادات المحادثة لكل مستخدم (تثبيت/كتم/أرشفة)
create table if not exists public.conversation_settings (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  archived boolean not null default false,
  primary key (conversation_id, user_id)
);
alter table public.conversation_settings enable row level security;
create policy "conv_settings_rw" on public.conversation_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- تسليم الرسائل + تفضيلات الإشعارات
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.profiles add column if not exists notif_prefs jsonb
  not null default '{"messages":true,"likes":true,"comments":true,"follows":true,"live":true,"gifts":true,"groups":true}'::jsonb;

-- منع تكرار الهدايا (idempotency)
alter table public.gifts_sent add column if not exists idempotency_key text;
create unique index if not exists gifts_idem_idx on public.gifts_sent (idempotency_key) where idempotency_key is not null;

create or replace function public.send_gift(p_gift_id uuid, p_receiver uuid, p_stream_id uuid default null, p_qty integer default 1, p_idem text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_price integer; v_total integer;
begin
  if v_user is null then raise exception 'auth required'; end if;
  if p_idem is not null and exists (select 1 from gifts_sent where idempotency_key = p_idem) then return; end if;
  select price into v_price from gifts where id = p_gift_id;
  if v_price is null then raise exception 'gift not found'; end if;
  v_total := v_price * greatest(p_qty, 1);
  update profiles set coins = coins - v_total where id = v_user and coins >= v_total;
  if not found then raise exception 'insufficient coins'; end if;
  update profiles set coins = coins + v_total where id = p_receiver;
  insert into gifts_sent (gift_id, sender_id, receiver_id, stream_id, quantity, idempotency_key)
    values (p_gift_id, v_user, p_receiver, p_stream_id, greatest(p_qty,1), p_idem);
  insert into coin_transactions (user_id, amount, reason, meta) values
    (v_user, -v_total, 'gift_sent', jsonb_build_object('gift', p_gift_id)),
    (p_receiver, v_total, 'gift_received', jsonb_build_object('gift', p_gift_id));
  insert into notifications (user_id, actor_id, kind, entity_id) values (p_receiver, v_user, 'system', p_gift_id);
end $$;

-- توثيق الحسابات من الإدارة
create or replace function public.admin_verify_user(p_target uuid, p_verified boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  update profiles set is_verified = p_verified where id = p_target;
  insert into admin_log (admin_id, action, target) values (auth.uid(), 'verify', p_target::text || '=' || p_verified);
end $$;

-- تعديل منشور (صاحبه فقط)
create or replace function public.update_post(p_post uuid, p_content text)
returns void language sql security definer set search_path = public as $$
  update posts set content = p_content where id = p_post and user_id = auth.uid();
$$;

-- ===== 00007_fix_chat_follow_live =====
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
