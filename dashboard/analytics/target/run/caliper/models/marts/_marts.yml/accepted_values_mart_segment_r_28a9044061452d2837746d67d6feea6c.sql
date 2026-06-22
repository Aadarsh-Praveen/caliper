select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
    

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



      
    ) dbt_internal_test