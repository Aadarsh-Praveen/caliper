-- Returns rows that FAIL the test (totals don't match)
with mart_totals as (
    select
        experiment_id,
        variant,
        sum(n) as total_segment_users
    from "caliper"."public"."mart_segment_results"
    where segment_dimension = 'device'  -- Only one dimension to avoid double-counting
    group by experiment_id, variant
),
assignment_totals as (
    select
        experiment_id,
        variant,
        count(*) as total_assignments
    from "caliper"."public"."stg_assignments"
    group by experiment_id, variant
),
joined as (
    select
        m.experiment_id,
        m.variant,
        m.total_segment_users,
        a.total_assignments
    from mart_totals m
    join assignment_totals a
        on m.experiment_id = a.experiment_id
        and m.variant = a.variant
)
select * from joined where total_segment_users != total_assignments