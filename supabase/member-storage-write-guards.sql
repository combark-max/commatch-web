-- ComMatch member Storage write guards.
--
-- This migration protects only INSERT and UPDATE policies for the two approved
-- profile-image buckets. SELECT, DELETE, bucket visibility, storage.objects
-- ACLs, and object data are intentionally unchanged.
--
-- DELETE remains available to the existing owner-folder policies because the
-- browser uploads an object before saving public.profiles and removes that
-- object if the database save fails. A suspension committed between those two
-- requests could otherwise prevent cleanup and leave an orphan object. This
-- means a suspended member may still be able to delete an existing object in
-- their own folder through the Storage API. Closing that remaining path safely
-- requires moving upload/cleanup to a reviewed service-role server workflow.

begin;

do $preflight$
declare
  v_authenticated_oid oid;
  v_function_oid oid;
begin
  if pg_catalog.to_regclass('storage.objects') is null
     or pg_catalog.to_regclass('storage.buckets') is null then
    raise exception 'Required Storage tables are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = 'storage.objects'::pg_catalog.regclass
      and relation_info.relrowsecurity
  ) then
    raise exception 'storage.objects must have RLS enabled';
  end if;

  select role_info.oid
  into v_authenticated_oid
  from pg_catalog.pg_roles as role_info
  where role_info.rolname = 'authenticated';

  if v_authenticated_oid is null
     or not exists (
       select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'anon'
     )
     or not exists (
       select 1 from pg_catalog.pg_roles as role_info where role_info.rolname = 'service_role'
     ) then
    raise exception 'Required anon, authenticated, or service_role role is missing';
  end if;

  if (
    select pg_catalog.count(*)
    from storage.buckets as bucket_info
    where bucket_info.id in ('profile_images', 'profile-images')
      and bucket_info.public
  ) <> 2 then
    raise exception 'The two approved profile image buckets must exist and remain public';
  end if;

  v_function_oid := pg_catalog.to_regprocedure(
    'public.is_member_service_allowed()'
  );

  if v_function_oid is null
     or pg_catalog.pg_get_function_result(v_function_oid) <> 'boolean'
     or not exists (
       select 1
       from pg_catalog.pg_proc as function_info
       join pg_catalog.pg_language as language_info
         on language_info.oid = function_info.prolang
       join pg_catalog.pg_roles as owner_info
         on owner_info.oid = function_info.proowner
       where function_info.oid = v_function_oid
         and function_info.prokind = 'f'
         and owner_info.rolname = 'postgres'
         and language_info.lanname = 'plpgsql'
         and function_info.prosecdef
         and function_info.provolatile = 'v'
         and function_info.proparallel = 'u'
         and not function_info.proretset
         and function_info.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
         and exists (
           select 1
           from pg_catalog.unnest(function_info.proconfig) as function_config(setting)
           where pg_catalog.split_part(function_config.setting, '=', 1) = 'search_path'
             and pg_catalog.replace(
               pg_catalog.substr(
                 function_config.setting,
                 pg_catalog.char_length('search_path=') + 1
               ),
               '"',
               ''
             ) = ''
         )
     ) then
    raise exception 'public.is_member_service_allowed() is missing or incompatible';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_info
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_info.proacl,
        pg_catalog.acldefault('f', function_info.proowner)
      )
    ) as function_acl
    where function_info.oid = v_function_oid
      and function_acl.grantee = 0
      and function_acl.privilege_type = 'EXECUTE'
  )
     or pg_catalog.has_function_privilege(
       'anon',
       v_function_oid,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'authenticated',
       v_function_oid,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       v_function_oid,
       'EXECUTE'
     ) then
    raise exception 'public.is_member_service_allowed() ACL is incompatible';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_insert',
        'profile_images_update',
        'Users can upload profile images',
        'Users can update profile images'
      )
  ) <> 4 then
    raise exception 'Approved profile image INSERT/UPDATE policy count differs';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_insert',
        'Users can upload profile images'
      )
      and (
        policy_info.polcmd <> 'a'
        or not policy_info.polpermissive
        or policy_info.polroles <> array[v_authenticated_oid]
        or policy_info.polqual is not null
        or policy_info.polwithcheck is null
      )
  ) or exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_update',
        'Users can update profile images'
      )
      and (
        policy_info.polcmd <> 'w'
        or not policy_info.polpermissive
        or policy_info.polroles <> array[v_authenticated_oid]
        or policy_info.polqual is null
        or policy_info.polwithcheck is null
      )
  ) then
    raise exception 'Approved profile image INSERT/UPDATE policy metadata differs';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_delete',
        'profile_images_select',
        'Users can delete profile images',
        'Public can view profile images'
      )
  ) <> 4 then
    raise exception 'Approved untouched profile image policy count differs';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and (
        (
          policy_info.polname in (
            'profile_images_delete',
            'Users can delete profile images'
          )
          and policy_info.polcmd <> 'd'
        )
        or (
          policy_info.polname in (
            'profile_images_select',
            'Public can view profile images'
          )
          and policy_info.polcmd <> 'r'
        )
      )
  ) then
    raise exception 'Approved untouched profile image policy commands differ';
  end if;
end
$preflight$;

create temporary table _commatch_storage_policy_baseline
on commit drop
as
select
  policy_info.oid as policy_oid,
  policy_info.polname,
  policy_info.polcmd,
  policy_info.polpermissive,
  policy_info.polroles,
  case
    when policy_info.polqual is null then null
    else pg_catalog.pg_get_expr(
      policy_info.polqual,
      policy_info.polrelid
    )
  end as using_expression,
  case
    when policy_info.polwithcheck is null then null
    else pg_catalog.pg_get_expr(
      policy_info.polwithcheck,
      policy_info.polrelid
    )
  end as check_expression
from pg_catalog.pg_policy as policy_info
where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
  and policy_info.polname in (
    'profile_images_insert',
    'profile_images_update',
    'profile_images_delete',
    'profile_images_select',
    'Users can upload profile images',
    'Users can update profile images',
    'Users can delete profile images',
    'Public can view profile images'
  );

create temporary table _commatch_storage_bucket_baseline
on commit drop
as
select bucket_info.id, bucket_info.public
from storage.buckets as bucket_info
where bucket_info.id in ('profile_images', 'profile-images');

create temporary table _commatch_storage_acl_baseline
on commit drop
as
select relation_info.relacl
from pg_catalog.pg_class as relation_info
where relation_info.oid = 'storage.objects'::pg_catalog.regclass;

create temporary table _commatch_storage_expected_policy_terms (
  policy_name name not null,
  expression_kind text not null,
  base_term text not null,
  primary key (policy_name, expression_kind, base_term)
) on commit drop;

insert into _commatch_storage_expected_policy_terms (
  policy_name,
  expression_kind,
  base_term
) values
  ('profile_images_insert', 'check', 'bucket_id=''profile_images'''),
  ('profile_images_insert', 'check', 'storage.foldernamename[1]=auth.uid'),
  ('profile_images_update', 'using', 'bucket_id=''profile_images'''),
  ('profile_images_update', 'using', 'storage.foldernamename[1]=auth.uid'),
  ('profile_images_update', 'check', 'bucket_id=''profile_images'''),
  ('profile_images_update', 'check', 'storage.foldernamename[1]=auth.uid'),
  ('Users can upload profile images', 'check', 'bucket_id=''profile-images'''),
  ('Users can upload profile images', 'check', 'storage.foldernamename[1]=''profiles'''),
  ('Users can upload profile images', 'check', 'storage.foldernamename[2]=auth.uid'),
  ('Users can update profile images', 'using', 'bucket_id=''profile-images'''),
  ('Users can update profile images', 'using', 'storage.foldernamename[1]=''profiles'''),
  ('Users can update profile images', 'using', 'storage.foldernamename[2]=auth.uid'),
  ('Users can update profile images', 'check', 'bucket_id=''profile-images'''),
  ('Users can update profile images', 'check', 'storage.foldernamename[1]=''profiles'''),
  ('Users can update profile images', 'check', 'storage.foldernamename[2]=auth.uid');

do $policy_definition_preflight$
declare
  v_invalid_expression_count integer;
begin
  with policy_expressions as (
    select
      policy_info.polname as policy_name,
      expression_source.expression_kind,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(expression_source.expression_text),
          '[[:space:]()]',
          '',
          'g'
        ),
        '::text',
        ''
      ) as normalized_expression
    from pg_catalog.pg_policy as policy_info
    cross join lateral (
      values
        (
          'using'::text,
          case
            when policy_info.polqual is null then null
            else pg_catalog.pg_get_expr(
              policy_info.polqual,
              policy_info.polrelid
            )
          end
        ),
        (
          'check'::text,
          case
            when policy_info.polwithcheck is null then null
            else pg_catalog.pg_get_expr(
              policy_info.polwithcheck,
              policy_info.polrelid
            )
          end
        )
    ) as expression_source(expression_kind, expression_text)
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_insert',
        'profile_images_update',
        'Users can upload profile images',
        'Users can update profile images'
      )
      and expression_source.expression_text is not null
  ), expression_terms as (
    select
      policy_expression.policy_name,
      policy_expression.expression_kind,
      expression_term.term,
      expression_term.term in (
        'selectis_member_service_allowedasis_member_service_allowed',
        'selectpublic.is_member_service_allowedasis_member_service_allowed'
      ) as is_guard
    from policy_expressions as policy_expression
    cross join lateral pg_catalog.unnest(
      pg_catalog.string_to_array(
        policy_expression.normalized_expression,
        'and'
      )
    ) as expression_term(term)
  ), expression_summary as (
    select
      policy_expression.policy_name,
      policy_expression.expression_kind,
      pg_catalog.count(*) filter (where expression_term.is_guard) as guard_count,
      pg_catalog.count(*) filter (where not expression_term.is_guard) as base_term_count,
      pg_catalog.count(distinct expression_term.term) filter (
        where not expression_term.is_guard
      ) as distinct_base_term_count
    from policy_expressions as policy_expression
    join expression_terms as expression_term
      on expression_term.policy_name = policy_expression.policy_name
     and expression_term.expression_kind = policy_expression.expression_kind
    group by policy_expression.policy_name, policy_expression.expression_kind
  ), invalid_expressions as (
    select expected_expression.policy_name, expected_expression.expression_kind
    from (
      select distinct policy_name, expression_kind
      from pg_temp._commatch_storage_expected_policy_terms
    ) as expected_expression
    left join expression_summary as actual_summary
      on actual_summary.policy_name = expected_expression.policy_name
     and actual_summary.expression_kind = expected_expression.expression_kind
    where actual_summary.policy_name is null
       or actual_summary.guard_count > 1
       or actual_summary.base_term_count <> (
         select pg_catalog.count(*)
         from pg_temp._commatch_storage_expected_policy_terms as expected_term
         where expected_term.policy_name = expected_expression.policy_name
           and expected_term.expression_kind = expected_expression.expression_kind
       )
       or actual_summary.distinct_base_term_count <> (
         select pg_catalog.count(*)
         from pg_temp._commatch_storage_expected_policy_terms as expected_term
         where expected_term.policy_name = expected_expression.policy_name
           and expected_term.expression_kind = expected_expression.expression_kind
       )

    union

    select actual_summary.policy_name, actual_summary.expression_kind
    from expression_summary as actual_summary
    left join (
      select distinct policy_name, expression_kind
      from pg_temp._commatch_storage_expected_policy_terms
    ) as expected_expression
      on expected_expression.policy_name = actual_summary.policy_name
     and expected_expression.expression_kind = actual_summary.expression_kind
    where expected_expression.policy_name is null

    union

    select expression_term.policy_name, expression_term.expression_kind
    from expression_terms as expression_term
    where not expression_term.is_guard
      and not exists (
        select 1
        from pg_temp._commatch_storage_expected_policy_terms as expected_term
        where expected_term.policy_name = expression_term.policy_name
          and expected_term.expression_kind = expression_term.expression_kind
          and expected_term.base_term = expression_term.term
      )

    union

    select expected_term.policy_name, expected_term.expression_kind
    from pg_temp._commatch_storage_expected_policy_terms as expected_term
    where not exists (
      select 1
      from expression_terms as expression_term
      where expression_term.policy_name = expected_term.policy_name
        and expression_term.expression_kind = expected_term.expression_kind
        and not expression_term.is_guard
        and expression_term.term = expected_term.base_term
    )
  )
  select pg_catalog.count(*)
  into v_invalid_expression_count
  from invalid_expressions;

  if v_invalid_expression_count <> 0 then
    raise exception 'A profile image INSERT/UPDATE policy has an unapproved definition';
  end if;
end
$policy_definition_preflight$;

do $install_write_guards$
declare
  v_policy record;
  v_using_expression text;
  v_check_expression text;
begin
  for v_policy in
    select
      policy_info.polname,
      policy_info.polcmd,
      policy_info.polrelid,
      policy_info.polqual,
      policy_info.polwithcheck
    from pg_catalog.pg_policy as policy_info
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_insert',
        'profile_images_update',
        'Users can upload profile images',
        'Users can update profile images'
      )
    order by policy_info.polname
  loop
    v_using_expression := case
      when v_policy.polqual is null then null
      else pg_catalog.pg_get_expr(v_policy.polqual, v_policy.polrelid)
    end;
    v_check_expression := pg_catalog.pg_get_expr(
      v_policy.polwithcheck,
      v_policy.polrelid
    );

    if v_policy.polcmd = 'w'
       and pg_catalog.strpos(
         pg_catalog.lower(v_using_expression),
         'is_member_service_allowed'
       ) = 0 then
      execute pg_catalog.format(
        'alter policy %I on storage.objects using ((%s) and (select public.is_member_service_allowed()))',
        v_policy.polname,
        v_using_expression
      );
    end if;

    if pg_catalog.strpos(
      pg_catalog.lower(v_check_expression),
      'is_member_service_allowed'
    ) = 0 then
      execute pg_catalog.format(
        'alter policy %I on storage.objects with check ((%s) and (select public.is_member_service_allowed()))',
        v_policy.polname,
        v_check_expression
      );
    end if;
  end loop;
end
$install_write_guards$;

do $postflight$
declare
  v_invalid_expression_count integer;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = 'storage.objects'::pg_catalog.regclass
      and relation_info.relrowsecurity
  ) then
    raise exception 'storage.objects RLS changed unexpectedly';
  end if;

  if exists (
    (
      select bucket_info.id, bucket_info.public
      from storage.buckets as bucket_info
      where bucket_info.id in ('profile_images', 'profile-images')
      except
      select * from pg_temp._commatch_storage_bucket_baseline
    )
  ) or exists (
    (
      select * from pg_temp._commatch_storage_bucket_baseline
      except
      select bucket_info.id, bucket_info.public
      from storage.buckets as bucket_info
      where bucket_info.id in ('profile_images', 'profile-images')
    )
  ) then
    raise exception 'Profile image bucket visibility changed unexpectedly';
  end if;

  if (
    select relation_info.relacl
    from pg_catalog.pg_class as relation_info
    where relation_info.oid = 'storage.objects'::pg_catalog.regclass
  ) is distinct from (
    select acl_baseline.relacl
    from pg_temp._commatch_storage_acl_baseline as acl_baseline
  ) then
    raise exception 'storage.objects ACL changed unexpectedly';
  end if;

  if exists (
    select 1
    from pg_temp._commatch_storage_policy_baseline as policy_baseline
    left join pg_catalog.pg_policy as policy_info
      on policy_info.oid = policy_baseline.policy_oid
    where policy_info.oid is null
       or policy_info.polrelid <> 'storage.objects'::pg_catalog.regclass
       or policy_info.polname <> policy_baseline.polname
       or policy_info.polcmd <> policy_baseline.polcmd
       or policy_info.polpermissive <> policy_baseline.polpermissive
       or policy_info.polroles <> policy_baseline.polroles
  ) then
    raise exception 'A profile image policy identity or metadata changed unexpectedly';
  end if;

  if exists (
    select 1
    from pg_temp._commatch_storage_policy_baseline as policy_baseline
    join pg_catalog.pg_policy as policy_info
      on policy_info.oid = policy_baseline.policy_oid
    where policy_baseline.polname in (
        'profile_images_delete',
        'profile_images_select',
        'Users can delete profile images',
        'Public can view profile images'
      )
      and (
        case
          when policy_info.polqual is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polqual,
            policy_info.polrelid
          )
        end is distinct from policy_baseline.using_expression
        or case
          when policy_info.polwithcheck is null then null
          else pg_catalog.pg_get_expr(
            policy_info.polwithcheck,
            policy_info.polrelid
          )
        end is distinct from policy_baseline.check_expression
      )
  ) then
    raise exception 'A profile image DELETE or SELECT policy changed unexpectedly';
  end if;

  with policy_expressions as (
    select
      policy_info.polname as policy_name,
      expression_source.expression_kind,
      pg_catalog.replace(
        pg_catalog.regexp_replace(
          pg_catalog.lower(expression_source.expression_text),
          '[[:space:]()]',
          '',
          'g'
        ),
        '::text',
        ''
      ) as normalized_expression
    from pg_catalog.pg_policy as policy_info
    cross join lateral (
      values
        (
          'using'::text,
          case
            when policy_info.polqual is null then null
            else pg_catalog.pg_get_expr(
              policy_info.polqual,
              policy_info.polrelid
            )
          end
        ),
        (
          'check'::text,
          case
            when policy_info.polwithcheck is null then null
            else pg_catalog.pg_get_expr(
              policy_info.polwithcheck,
              policy_info.polrelid
            )
          end
        )
    ) as expression_source(expression_kind, expression_text)
    where policy_info.polrelid = 'storage.objects'::pg_catalog.regclass
      and policy_info.polname in (
        'profile_images_insert',
        'profile_images_update',
        'Users can upload profile images',
        'Users can update profile images'
      )
      and expression_source.expression_text is not null
  ), expression_terms as (
    select
      policy_expression.policy_name,
      policy_expression.expression_kind,
      expression_term.term,
      expression_term.term in (
        'selectis_member_service_allowedasis_member_service_allowed',
        'selectpublic.is_member_service_allowedasis_member_service_allowed'
      ) as is_guard
    from policy_expressions as policy_expression
    cross join lateral pg_catalog.unnest(
      pg_catalog.string_to_array(
        policy_expression.normalized_expression,
        'and'
      )
    ) as expression_term(term)
  ), expression_summary as (
    select
      policy_expression.policy_name,
      policy_expression.expression_kind,
      pg_catalog.count(*) filter (where expression_term.is_guard) as guard_count,
      pg_catalog.count(*) filter (where not expression_term.is_guard) as base_term_count,
      pg_catalog.count(distinct expression_term.term) filter (
        where not expression_term.is_guard
      ) as distinct_base_term_count
    from policy_expressions as policy_expression
    join expression_terms as expression_term
      on expression_term.policy_name = policy_expression.policy_name
     and expression_term.expression_kind = policy_expression.expression_kind
    group by policy_expression.policy_name, policy_expression.expression_kind
  ), invalid_expressions as (
    select expected_expression.policy_name, expected_expression.expression_kind
    from (
      select distinct policy_name, expression_kind
      from pg_temp._commatch_storage_expected_policy_terms
    ) as expected_expression
    left join expression_summary as actual_summary
      on actual_summary.policy_name = expected_expression.policy_name
     and actual_summary.expression_kind = expected_expression.expression_kind
    where actual_summary.policy_name is null
       or actual_summary.guard_count <> 1
       or actual_summary.base_term_count <> (
         select pg_catalog.count(*)
         from pg_temp._commatch_storage_expected_policy_terms as expected_term
         where expected_term.policy_name = expected_expression.policy_name
           and expected_term.expression_kind = expected_expression.expression_kind
       )
       or actual_summary.distinct_base_term_count <> (
         select pg_catalog.count(*)
         from pg_temp._commatch_storage_expected_policy_terms as expected_term
         where expected_term.policy_name = expected_expression.policy_name
           and expected_term.expression_kind = expected_expression.expression_kind
       )

    union

    select actual_summary.policy_name, actual_summary.expression_kind
    from expression_summary as actual_summary
    left join (
      select distinct policy_name, expression_kind
      from pg_temp._commatch_storage_expected_policy_terms
    ) as expected_expression
      on expected_expression.policy_name = actual_summary.policy_name
     and expected_expression.expression_kind = actual_summary.expression_kind
    where expected_expression.policy_name is null

    union

    select expression_term.policy_name, expression_term.expression_kind
    from expression_terms as expression_term
    where not expression_term.is_guard
      and not exists (
        select 1
        from pg_temp._commatch_storage_expected_policy_terms as expected_term
        where expected_term.policy_name = expression_term.policy_name
          and expected_term.expression_kind = expression_term.expression_kind
          and expected_term.base_term = expression_term.term
      )

    union

    select expected_term.policy_name, expected_term.expression_kind
    from pg_temp._commatch_storage_expected_policy_terms as expected_term
    where not exists (
      select 1
      from expression_terms as expression_term
      where expression_term.policy_name = expected_term.policy_name
        and expression_term.expression_kind = expected_term.expression_kind
        and not expression_term.is_guard
        and expression_term.term = expected_term.base_term
    )
  )
  select pg_catalog.count(*)
  into v_invalid_expression_count
  from invalid_expressions;

  if v_invalid_expression_count <> 0 then
    raise exception 'A profile image INSERT/UPDATE policy was not guarded exactly';
  end if;
end
$postflight$;

commit;
