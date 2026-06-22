select
      count(*) as failures,
      count(*) != 0 as should_warn,
      count(*) != 0 as should_error
    from (
      
    
    



select experiment_id
from "caliper"."public"."raw_assignments"
where experiment_id is null



      
    ) dbt_internal_test