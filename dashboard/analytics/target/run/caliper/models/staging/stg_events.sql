
  create view "caliper"."public"."stg_events__dbt_tmp"
    
    
  as (
    

with source as (
    select * from "caliper"."public"."raw_events"
)

select
    event_id,
    experiment_id,
    user_id,
    variant,
    event_name,
    properties,
    -- Extract device and country from context JSON for downstream use
    context->>'device' as device,
    context->>'country' as country,
    ts as event_ts,
    created_at
from source
  );