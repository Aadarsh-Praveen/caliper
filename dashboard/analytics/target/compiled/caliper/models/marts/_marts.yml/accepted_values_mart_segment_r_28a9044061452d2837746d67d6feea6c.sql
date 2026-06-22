
    
    

with all_values as (

    select
        segment_dimension as value_field,
        count(*) as n_records

    from "caliper"."public"."mart_segment_results"
    group by segment_dimension

)

select *
from all_values
where value_field not in (
    'device','country'
)


