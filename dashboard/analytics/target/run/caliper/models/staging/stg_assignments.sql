
  create view "caliper"."public"."stg_assignments__dbt_tmp"
    
    
  as (
    

with source as (
    select * from "caliper"."public"."raw_assignments"
)

select
    assignment_id,
    experiment_id,
    user_id,
    variant,
    pre_experiment_activity,
    assigned_at
from source
  );