-- ComMatch launch Premium promotion read-only eligibility report.
--
-- Run this before launch-premium-promotion-migration.sql. This file performs
-- no writes and intentionally reports counts rather than member identifiers.

with campaign as (
  select
    pg_catalog.now() as checked_at,
    '2027-01-01 00:00:00+09'::timestamptz as expires_at
),
population as (
  select
    auth_user.id,
    auth_user.email_confirmed_at is not null as is_email_confirmed,
    profile.id is not null as has_profile,
    admin_account.user_id is not null as is_admin,
    membership.user_id is not null as has_membership
  from auth.users as auth_user
  left join public.profiles as profile
    on profile.id = auth_user.id
  left join public.admin_accounts as admin_account
    on admin_account.user_id = auth_user.id
  left join public.premium_memberships as membership
    on membership.user_id = auth_user.id
)
select
  campaign.checked_at,
  campaign.expires_at as campaign_expires_at,
  campaign.checked_at < campaign.expires_at as campaign_is_open,
  pg_catalog.count(*) as auth_user_count,
  pg_catalog.count(*) filter (where not population.is_email_confirmed)
    as excluded_unconfirmed_count,
  pg_catalog.count(*) filter (where not population.has_profile)
    as excluded_missing_profile_count,
  pg_catalog.count(*) filter (where population.is_admin)
    as excluded_admin_count,
  pg_catalog.count(*) filter (where population.has_membership)
    as excluded_existing_membership_count,
  pg_catalog.count(*) filter (
    where campaign.checked_at < campaign.expires_at
      and population.is_email_confirmed
      and population.has_profile
      and not population.is_admin
      and not population.has_membership
  ) as eligible_backfill_count
from population
cross join campaign
group by campaign.checked_at, campaign.expires_at;
