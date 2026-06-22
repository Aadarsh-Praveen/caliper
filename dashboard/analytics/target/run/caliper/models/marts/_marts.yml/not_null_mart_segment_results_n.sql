select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
    



select n
from "caliper"."public"."mart_segment_results"
where n is null



      
    ) dbt_internal_test