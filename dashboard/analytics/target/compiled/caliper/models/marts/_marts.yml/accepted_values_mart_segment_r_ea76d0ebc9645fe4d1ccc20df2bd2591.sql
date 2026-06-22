
    
    

with all_values as (

    select
        variant as value_field,
        count(*) as n_records

    from "caliper"."public"."mart_segment_results"
    group by variant

)

select *
from all_values
where value_field not in (
    'control','treatment'
)


