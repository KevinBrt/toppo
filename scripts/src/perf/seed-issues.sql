-- A database of realistic size, to check query plans: 30 projects, 200 people, 100,000 issues.
-- Runs on a database migrated and set up (its first administrator created). Volumes and
-- proportions are those of a busy self-hosted instance: one large project, one medium, many
-- small; two issues in three closed; a quarter unassigned.

begin;

create function pg_temp.pick(choices text[]) returns text
  language sql volatile
  return choices[1 + floor(random() * array_length(choices, 1))::int];

-- Words of issues as people write them, in English and French, accents included: the first
-- ones much more often than the last, as in any text, and one word in ten an error code, rare
-- by nature (E1000 to E9999).
create function pg_temp.word() returns text
  language sql volatile
  return case when random() < 0.1 then 'E' || (1000 + floor(random() * 9000)::int) else (array[
    'the', 'le', 'la', 'on', 'sur', 'with', 'avec', 'when', 'quand', 'error', 'erreur', 'page',
    'after', 'après', 'login', 'connexion', 'export', 'import', 'shows', 'affiche', 'fails',
    'échoue', 'slow', 'lent', 'crash', 'button', 'bouton', 'search', 'recherche', 'email',
    'notification', 'mobile', 'too', 'trop', 'empty', 'vide', 'missing', 'manquant', 'wrong',
    'mauvais', 'filter', 'filtre', 'upload', 'settings', 'paramètres', 'menu', 'link', 'lien',
    'broken', 'cassé', 'date', 'report', 'rapport', 'dashboard', 'tableau', 'user',
    'utilisateur', 'password', 'session', 'image', 'profile', 'profil', 'timeout', 'cache',
    'database', 'sync', 'android', 'iOS', 'API', 'PDF', 'CSV', 'header', 'footer', 'font',
    'translation', 'traduction', 'timezone', 'fuseau', 'duplicate', 'doublon', 'blank', 'blanc',
    'long', 'video', 'avatar', 'cart', 'panier', 'checkout', 'invoice', 'facture', 'payment',
    'paiement', 'téléchargement', 'sécurité', 'calendrier', 'webhook', 'Safari', 'Chrome'
  ])[1 + floor(power(random(), 2) * 98)::int] end;

create function pg_temp.words(count int) returns text
  language sql volatile
  return (select string_agg(pg_temp.word(), ' ') from generate_series(1, count));

create temporary table perf_projects (key text primary key, name text, size int) on commit drop;
insert into perf_projects values ('BIG', 'Main product', 40000), ('MID', 'Mobile apps', 20000);
insert into perf_projects
  select 'P' || lpad(n::text, 2, '0'), 'Project ' || n, 1429 from generate_series(1, 28) as n;

insert into projects (id, key, name, color)
  select uuidv7(), key, name,
    pg_temp.pick(array['gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink'])
  from perf_projects;

insert into users (id, name, email, instance_role_id)
  select uuidv7(), 'Person ' || n, 'person' || n || '@example.com',
    -- DEFAULT_ROLE_IDS.team (@toppo-tracker/core).
    '01a1569b-9801-747e-91c9-d058653f2a8e'::uuid
  from generate_series(1, 200) as n;

-- Everyone in six projects or so; the people signed in for the check join their own way.
insert into project_members (id, project_id, user_id)
  select uuidv7(), chosen.id, people.id
  from users as people
  cross join lateral (
    select id from projects where people.id is not null order by random() limit 6
  ) as chosen
  where people.email like 'person%@example.com'
on conflict do nothing;

create temporary table perf_fields on commit drop as
  select
    array(select ws.status_id from workflow_statuses ws join workflows w on w.id = ws.workflow_id
          join statuses s on s.id = ws.status_id where w.project_id is null and not s.closes) as open,
    array(select ws.status_id from workflow_statuses ws join workflows w on w.id = ws.workflow_id
          join statuses s on s.id = ws.status_id where w.project_id is null and s.closes) as closing,
    array(select id from priorities order by level) as priorities,
    array(select id from issue_categories) as categories,
    array(select id from users where email like 'person%@example.com') as people;

-- Properties as an instance has them: a version on most issues, a platform on some, a due day
-- and an estimate on a few, a box ticked on one in twenty.
insert into properties (id, name, type, shown_in_list) values
  (uuidv7(), 'Version', 'list', true),
  (uuidv7(), 'Platforms', 'multiSelect', true),
  (uuidv7(), 'Due', 'date', true),
  (uuidv7(), 'Estimate', 'number', false),
  (uuidv7(), 'Blocking', 'checkbox', true);

insert into property_options (id, property_id, name, position)
  select uuidv7(), p.id, option.name, option.position
  from properties p
  cross join lateral (
    select '1.' || n as name, n as position from generate_series(0, 9) as n
      where p.name = 'Version'
    union all
    select name, position::int
      from unnest(array['iOS', 'Android', 'Web', 'Desktop']) with ordinality as o(name, position)
      where p.name = 'Platforms'
  ) as option;

create temporary table perf_properties on commit drop as
  select
    (select id from properties where name = 'Version') as version,
    array(select o.id::text from property_options o join properties p on p.id = o.property_id
          where p.name = 'Version' order by o.position) as versions,
    (select id from properties where name = 'Platforms') as platforms,
    array(select o.id::text from property_options o join properties p on p.id = o.property_id
          where p.name = 'Platforms' order by o.position) as platform_options,
    (select id from properties where name = 'Due') as due,
    (select id from properties where name = 'Estimate') as estimate,
    (select id from properties where name = 'Blocking') as blocking;

insert into issues (
  id, project_id, number, category_id, title, description, status_id, priority_id,
  assignee_id, reporter_id, closed_at, created_at, updated_at, properties
)
  select uuidv7(), project_id, number, category_id, title, description, status_id, priority_id,
    assignee_id, reporter_id, case when closed then updated_at end, created_at, updated_at,
    properties
  from (
    select p.id as project_id, n as number,
      f.categories[1 + floor(random() * array_length(f.categories, 1))::int] as category_id,
      initcap(pg_temp.words(4 + floor(random() * 6)::int)) as title,
      (select string_agg(initcap(pg_temp.words(6 + floor(random() * 10)::int)) || '.', ' ')
        from generate_series(1, 2 + floor(random() * 6)::int) where n is not null) as description,
      closed,
      case when closed
        then f.closing[1 + floor(random() * array_length(f.closing, 1))::int]
        else f.open[1 + floor(random() * array_length(f.open, 1))::int]
      end as status_id,
      -- Low 20 %, normal 50 %, high 20 %, urgent 10 %.
      f.priorities[case when roll < 0.2 then 1 when roll < 0.7 then 2 when roll < 0.9 then 3 else 4 end]
        as priority_id,
      case when random() < 0.25 then null
        else f.people[1 + floor(random() * array_length(f.people, 1))::int] end as assignee_id,
      f.people[1 + floor(random() * array_length(f.people, 1))::int] as reporter_id,
      draw.created_at,
      draw.created_at + random() * (now() - draw.created_at) as updated_at,
      -- Values as the server stores them; a property without a value is left out.
      jsonb_strip_nulls(jsonb_build_object(
        pr.version::text,
          case when random() < 0.8 then to_jsonb(pr.versions[1 + floor(random() * 10)::int]) end,
        pr.platforms::text,
          case when random() < 0.4
            then to_jsonb(array[pr.platform_options[1 + floor(random() * 4)::int]]) end,
        pr.due::text,
          case when random() < 0.3 then to_jsonb(
            to_char(now() + (random() * 120 - 60) * interval '1 day', 'YYYY-MM-DD')) end,
        pr.estimate::text,
          case when random() < 0.3 then to_jsonb(1 + floor(random() * 13)::int) end,
        pr.blocking::text, case when random() < 0.05 then 'true'::jsonb end
      )) as properties
    from perf_projects pp
    join projects p on p.key = pp.key
    cross join perf_fields f
    cross join perf_properties pr
    cross join lateral generate_series(1, pp.size) as n
    cross join lateral (
      select random() < 0.65 as closed, random() as roll,
        now() - random() * interval '730 days' as created_at
      where n is not null
    ) as draw
  ) as drawn;

-- The words a typo is corrected to, as the server's search.rebuildWords job keeps them.
insert into issue_words (id, word)
  select uuidv7(), word from ts_stat('select search_vector from issues')
  where word ~ '^[[:alnum:]]{4,}$';

update projects
  set next_issue_number = counts.last + 1
  from (select project_id, max(number) as last from issues group by project_id) as counts
  where counts.project_id = projects.id;

commit;

-- As autovacuum leaves a table at rest: statistics, and pages marked visible for index-only scans.
vacuum analyze;
