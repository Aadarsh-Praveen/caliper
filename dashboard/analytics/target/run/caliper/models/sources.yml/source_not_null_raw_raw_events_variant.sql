select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
    



select variant
from "caliper"."public"."raw_events"
where variant is null



      
    ) dbt_internal_test