-- ============================================================================
--  Campus Lost & Found — Supabase Database Setup
-- ----------------------------------------------------------------------------
--  HOW TO USE
--   1. Open your Supabase project dashboard → SQL Editor → New query.
--   2. Paste this entire file and click "Run". You can safely re-run it.
--
--  Seeded demo accounts
--   Admin   admin@campus.edu / admin123
--   Student demo@campus.edu / demo123
--
--  What this script creates
--   - Tables: profiles, items, claims, notifications
--   - Row Level Security policies for each table + a public "item-photos" bucket
--   - An automatic trigger that creates a profile row when someone signs up
--   - A set of triggers that generate notifications (new items, matches,
--     claims, approvals/rejections) so the client code stays simple
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('lost', 'found')),
  title text not null,
  category text not null,
  description text not null,
  location text not null,
  date date not null,
  photo_url text,
  status text not null default 'open' check (status in ('open', 'claimed', 'resolved')),
  reported_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  claimant_uid uuid not null references public.profiles (id) on delete cascade,
  owner_name text,
  contact_info text,
  verification_details text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'meeting_required')),
  rejection_reason text,
  admin_notes text,
  meeting_details text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.claims (id) on delete cascade,
  item_id uuid references public.items (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists items_type_idx on public.items (type);
create index if not exists items_status_idx on public.items (status);
create index if not exists items_category_idx on public.items (category);
create index if not exists claims_item_idx on public.claims (item_id);
create index if not exists claims_status_idx on public.claims (status);
create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists messages_claim_idx on public.messages (claim_id);
create index if not exists messages_recipient_idx on public.messages (recipient_id);

create unique index if not exists claims_unique_active_claim
  on public.claims (item_id, claimant_uid)
  where status in ('pending', 'meeting_required');

-- ----------------------------------------------------------------------------
-- 2. AUTO-CREATE A PROFILE WHEN A USER SIGNS UP
--    Reads name/role from the sign-up form metadata (set in the client).
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;
alter table public.notifications enable row level security;
alter table public.messages enable row level security;

-- Helper: is the current user an active admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- profiles: everyone can read (needed to show reporter names); only admins
-- can modify rows (deactivate/reactivate). Regular users cannot change their
-- own role or status.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles for delete using (public.is_admin());

-- Atomic claim approval: marks the claim approved AND the item claimed in a
-- single transaction, so the two never drift apart. Called from the admin UI.
create or replace function public.approve_claim(target_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can approve claims';
  end if;

  update public.claims
  set status = 'approved'
  where id = target_claim_id and status in ('pending', 'meeting_required');

  if not found then
    raise exception 'Claim not found or already decided';
  end if;

  select item_id into v_item_id from public.claims where id = target_claim_id;

  update public.items
  set status = 'claimed'
  where id = v_item_id and status = 'open';

  -- Auto-reject other active claims on the same item
  update public.claims
  set status = 'rejected',
      rejection_reason = 'Another claim was approved for this item'
  where item_id = v_item_id
    and id != target_claim_id
    and status in ('pending', 'meeting_required');
end;
$$;

grant execute on function public.approve_claim(uuid) to authenticated;

-- items: anyone can browse; signed-in users report items; admins moderate.
drop policy if exists "items_select" on public.items;
create policy "items_select" on public.items for select using (true);

drop policy if exists "items_insert" on public.items;
create policy "items_insert" on public.items for insert with check (auth.uid() = reported_by);

drop policy if exists "items_admin_update" on public.items;
create policy "items_admin_update" on public.items for update using (public.is_admin());

drop policy if exists "items_admin_delete" on public.items;
create policy "items_admin_delete" on public.items for delete using (public.is_admin());

-- claims: anyone can view; users claim items on their own behalf; admins decide.
drop policy if exists "claims_select" on public.claims;
create policy "claims_select" on public.claims for select using (true);

drop policy if exists "claims_insert" on public.claims;
create policy "claims_insert" on public.claims for insert with check (auth.uid() = claimant_uid);

drop policy if exists "claims_admin_update" on public.claims;
create policy "claims_admin_update" on public.claims for update using (public.is_admin());

-- notifications: users only ever see their own; authenticated users can send notifications
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert with check (auth.uid() is not null);

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update using (auth.uid() = user_id);

drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_delete" on public.notifications for delete using (auth.uid() = user_id);

-- messages: any authenticated user can send; sender, recipient, and admin can read; recipient marks read
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id or public.is_admin());

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- ----------------------------------------------------------------------------
-- 4. STORAGE — public bucket for item photos (5 MB limit)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'item-photos',
  'item-photos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic']
)
on conflict (id) do nothing;

drop policy if exists "item_photos_public_read" on storage.objects;
create policy "item_photos_public_read" on storage.objects
  for select using (bucket_id = 'item-photos');

drop policy if exists "item_photos_auth_upload" on storage.objects;
create policy "item_photos_auth_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos');

drop policy if exists "item_photos_auth_delete" on storage.objects;
create policy "item_photos_auth_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos');

-- ----------------------------------------------------------------------------
-- 5. SEED — demo accounts + sample items (only when empty)
--    The profile rows for these accounts are created automatically by the
--    on_auth_user_created trigger above.
-- ----------------------------------------------------------------------------

do $$
declare
  admin_id uuid;
  demo_id  uuid;
begin
  -- Admin account: admin@campus.edu / admin123
  select id into admin_id from auth.users where email = 'admin@campus.edu';
  if admin_id is null then
    admin_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'admin@campus.edu', crypt('admin123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Campus Admin","role":"admin"}'::jsonb, now(), now(),
      '', '', '', ''
    );
  end if;

  -- Demo student account: demo@campus.edu / demo123
  select id into demo_id from auth.users where email = 'demo@campus.edu';
  if demo_id is null then
    demo_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', demo_id, 'authenticated', 'authenticated',
      'demo@campus.edu', crypt('demo123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Demo Student","role":"user"}'::jsonb, now(), now(),
      '', '', '', ''
    );
  end if;

  -- Sample items (skipped if items already exist)
  if not exists (select 1 from public.items) then
    insert into public.items (type, title, category, description, location, date, photo_url, status, reported_by) values
      ('found', 'Black Acer Aspire Laptop', 'Electronics',
       'Found in the Main Library, second-floor quiet study area near the window desks. Fully charged; charger not included.',
       'Main Library, 2nd Floor', '2026-08-09',
       'https://picsum.photos/seed/laptop/720/540', 'open', demo_id),
      ('found', 'Navy Blue Herschel Backpack', 'Bags & Luggage',
       'Left at the food-court entrance of the Student Center. Contains a few notebooks, a water bottle and a green hoodie.',
       'Student Center, Food Court', '2026-08-08',
       'https://picsum.photos/seed/backpack/720/540', 'open', demo_id),
      ('found', 'Silver Casio Digital Watch', 'Accessories',
       'Found in the Sports Complex locker room on the top-row lockers. The band is slightly worn.',
       'Sports Complex, Locker Room', '2026-08-06',
       'https://picsum.photos/seed/watch/720/540', 'open', demo_id),
      ('lost', 'Calculus: Early Transcendentals', 'Books & Study Materials',
       'Lost near the Science Building. Red cover; my name is written on the first page.',
       'Science Building, Rm 204', '2026-08-05',
       'https://picsum.photos/seed/textbook/720/540', 'open', demo_id),
      ('lost', 'Student ID Card', 'IDs & Cards',
       'Lost somewhere on the North Quad during the welcome fair. The card has a lanyard attached.',
       'North Quad', '2026-08-04',
       'https://picsum.photos/seed/idcard/720/540', 'open', demo_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. NOTIFICATION TRIGGERS (system events)
--    These keep the client code simple: the app just writes items/claims and
--    the database takes care of informing the right people.
-- ----------------------------------------------------------------------------

-- New item reported/registered → notify every active admin
create or replace function public.notify_admins_new_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, message)
  select p.id,
         coalesce(r.name, 'A user')
           || case when new.type = 'lost'
                   then ' reported a lost item: “' || new.title || '”'
                   else ' registered a found item: “' || new.title || '”' end
  from public.profiles p
  left join public.profiles r on r.id = new.reported_by
  where p.role = 'admin' and p.active = true;
  return new;
end;
$$;

drop trigger if exists items_notify_admins on public.items;
create trigger items_notify_admins
  after insert on public.items
  for each row execute function public.notify_admins_new_item();

-- New item registered/reported → notify owners of matching open items in same category
create or replace function public.notify_matching_owners()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'found' then
    -- A found item was registered -> notify owners of open lost items in same category
    insert into public.notifications (user_id, message)
    select i.reported_by,
           'A found item matching your lost “' || i.title || '” was just registered: “'
             || new.title || '” (' || new.category || ').'
    from public.items i
    where i.type = 'lost'
      and i.status = 'open'
      and lower(trim(i.category)) = lower(trim(new.category))
      and i.reported_by is not null
      and i.reported_by is distinct from new.reported_by;

  elsif new.type = 'lost' then
    -- A lost item was reported -> check if a matching found item is already in system
    insert into public.notifications (user_id, message)
    select new.reported_by,
           'A previously registered found item may match your lost “' || new.title || '”: “'
             || i.title || '” (' || i.category || ').'
    from public.items i
    where i.type = 'found'
      and i.status = 'open'
      and lower(trim(i.category)) = lower(trim(new.category))
      and i.reported_by is not null
      and i.reported_by is distinct from new.reported_by;
  end if;
  return new;
end;
$$;

drop trigger if exists items_notify_matching on public.items;
create trigger items_notify_matching
  after insert on public.items
  for each row execute function public.notify_matching_owners();

-- New claim submitted → notify every active admin
create or replace function public.notify_admins_new_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_title text;
begin
  select title into item_title from public.items where id = new.item_id;
  insert into public.notifications (user_id, message)
  select p.id,
         coalesce(c.name, 'A user') || ' submitted a claim for “' || coalesce(item_title, 'an item') || '”.'
  from public.profiles p
  left join public.profiles c on c.id = new.claimant_uid
  where p.role = 'admin' and p.active = true;
  return new;
end;
$$;

drop trigger if exists claims_notify_admins on public.claims;
create trigger claims_notify_admins
  after insert on public.claims
  for each row execute function public.notify_admins_new_claim();

-- Claim approved/rejected → notify the claimant (and the finder on approval)
create or replace function public.notify_claim_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_title text;
begin
  if new.status = old.status or new.status not in ('approved', 'rejected', 'meeting_required') then
    return new;
  end if;

  select title into item_title from public.items where id = new.item_id;

  if new.status = 'approved' then
    insert into public.notifications (user_id, message)
    values (new.claimant_uid,
            'Your claim for “' || coalesce(item_title, 'item') || '” was approved. Contact the finder to arrange pickup.');

    insert into public.notifications (user_id, message)
    select i.reported_by,
           'The claim for your found “' || i.title || '” was approved — the item is now marked as claimed.'
    from public.items i
    where i.id = new.item_id and i.reported_by is not null;

  elsif new.status = 'meeting_required' then
    insert into public.notifications (user_id, message)
    values (new.claimant_uid,
            'An admin needs to verify your claim for “' || coalesce(item_title, 'item') || '” in person.'
              || case when new.meeting_details is not null
                      then ' ' || new.meeting_details
                      else ' Please contact the admin office to arrange a meeting.'
                 end);

  else
    insert into public.notifications (user_id, message)
    values (new.claimant_uid,
            'Your claim for “' || coalesce(item_title, 'item') || '” was rejected'
              || case when new.rejection_reason is not null
                      then ': ' || new.rejection_reason
                      else '.' end);
  end if;

  return new;
end;
$$;

drop trigger if exists claims_notify_decision on public.claims;
create trigger claims_notify_decision
  after update on public.claims
  for each row execute function public.notify_claim_decision();

-- Item marked resolved → notify the approved claimant
create or replace function public.notify_item_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'resolved' and new.status is distinct from old.status then
    insert into public.notifications (user_id, message)
    select c.claimant_uid,
           'Your claimed item “' || new.title || '” has been marked as resolved. Thank you for using Campus Lost & Found!'
    from public.claims c
    where c.item_id = new.id and c.status = 'approved'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists items_notify_resolved on public.items;
create trigger items_notify_resolved
  after update on public.items
  for each row execute function public.notify_item_resolved();

-- New message → notify recipient with sender name and item/claim info
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  v_title text;
begin
  select name into sender_name from public.profiles where id = new.sender_id;

  if new.item_id is not null then
    select title into v_title from public.items where id = new.item_id;
  elsif new.claim_id is not null then
    select i.title into v_title
    from public.claims c
    join public.items i on i.id = c.item_id
    where c.id = new.claim_id;
  end if;

  insert into public.notifications (user_id, message)
  values (
    new.recipient_id,
    coalesce(sender_name, 'A user') || ' sent you a message'
      || case when v_title is not null then ' regarding “' || v_title || '”' else '' end
      || ': “' || case when length(new.body) > 60 then substr(new.body, 1, 57) || '…' else new.body end || '”'
  );
  return new;
end;
$$;

drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_new_message();

-- Helper RPC: direct owner notification when someone reports finding a lost item
create or replace function public.notify_item_found(
  target_item_id uuid,
  finder_contact text,
  found_location text,
  finder_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_finder_name text;
  v_msg text;
begin
  select id, title, reported_by into v_item
  from public.items
  where id = target_item_id;

  if not found then
    raise exception 'Item not found';
  end if;

  if v_item.reported_by is null then
    raise exception 'This item has no recorded owner';
  end if;

  if v_item.reported_by = auth.uid() then
    raise exception 'You cannot notify yourself';
  end if;

  select name into v_finder_name from public.profiles where id = auth.uid();

  v_msg := coalesce(v_finder_name, 'Someone') || ' found your lost “' || v_item.title || '”!'
           || ' Location: ' || found_location
           || ' · Contact: ' || finder_contact;

  if finder_note is not null and length(trim(finder_note)) > 0 then
    v_msg := v_msg || ' · Note: ' || trim(finder_note);
  end if;

  insert into public.notifications (user_id, message)
  values (v_item.reported_by, v_msg);
end;
$$;

grant execute on function public.notify_item_found(uuid, text, text, text) to authenticated;

