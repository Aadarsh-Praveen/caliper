
    
    

select
    assignment_id as unique_field,
    count(*) as n_records

from "caliper"."public"."raw_assignments"
where assignment_id is not null
group by assignment_id
having count(*) > 1


