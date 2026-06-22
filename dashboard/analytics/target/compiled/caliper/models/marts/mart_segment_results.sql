

with user_outcomes as (
    select * from "caliper"."public"."int_user_outcomes"
),
-- Unpivot device and country into a single (dimension, value) column
unpivoted as (
    select
        experiment_id,
        variant,
        'device' as segment_dimension,
        device as segment_value,
        converted
    from user_outcomes

    union all

    select
        experiment_id,
        variant,
        'country' as segment_dimension,
        country as segment_value,
        converted
    from user_outcomes
)
select
    experiment_id,
    variant,
    segment_dimension,
    segment_value,
    count(*) as n,
    sum(converted) as conversions,
    case
        when count(*) > 0 then sum(converted)::float / count(*)::float
        else 0
    end as conversion_rate,
    now() as computed_at
from unpivoted
group by experiment_id, variant, segment_dimension, segment_value