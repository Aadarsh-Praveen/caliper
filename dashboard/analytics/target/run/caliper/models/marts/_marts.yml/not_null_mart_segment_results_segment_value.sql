select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
    



select segment_value
from "caliper"."public"."mart_segment_results"
where segment_value is null



      
    ) dbt_internal_test