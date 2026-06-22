
  create view "caliper"."public"."int_user_outcomes__dbt_tmp"
    
    
  as (
    

with assignments as (
    select * from "caliper"."public"."stg_assignments"
),
events as (
    select * from "caliper"."public"."stg_events"
),
-- For each user-experiment pair, did they convert on the primary metric?
conversions as (
    select
        experiment_id,
        user_id,
        max(case when event_name = 'buy_section_view' then 1 else 0 end) as converted_buy_section_view,
        max(case when event_name = 'add_to_cart' then 1 else 0 end) as converted_add_to_cart,
        max(case when event_name = 'nav_cta_click' then 1 else 0 end) as converted_nav_cta_click,
        max(device) as device,        -- first-observed device per user
        max(country) as country        -- first-observed country per user
    from events
    group by experiment_id, user_id
),
joined as (
    select
        a.experiment_id,
        a.user_id,
        a.variant,
        a.pre_experiment_activity,
        coalesce(c.device, 'unknown') as device,
        coalesce(c.country, 'unknown') as country,
        -- Pick the right conversion column per experiment
        case
            when a.experiment_id = 'hero_cta_test' then c.converted_buy_section_view
            when a.experiment_id = 'buy_button_test' then c.converted_add_to_cart
            when a.experiment_id = 'nav_layout_test' then c.converted_nav_cta_click
            else 0
        end as converted
    from assignments a
    left join conversions c
        on a.experiment_id = c.experiment_id
        and a.user_id = c.user_id
)

select * from joined
  );