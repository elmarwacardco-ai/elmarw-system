-- Run in Supabase SQL Editor after taking a backup. This function is called only by the server service role.
create or replace function public.marwa_mutate_resource(
 p_resource text, p_action text, p_id text default null, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
 doc jsonb; arr jsonb; updated jsonb; item jsonb; found boolean; new_id bigint;
begin
 if p_resource not in ('clients','categories','subCategories','products','orders','employees','folders') then
   raise exception 'Invalid resource';
 end if;
 if p_action not in ('POST','PUT','DELETE') then raise exception 'Invalid operation'; end if;
 select data::jsonb into doc from public.app_data where id=1 for update;
 if doc is null then raise exception 'Missing app_data row'; end if;
 arr := coalesce(doc->p_resource, '[]'::jsonb);
 if jsonb_typeof(arr) <> 'array' then raise exception 'Resource is not an array'; end if;
 if p_action='POST' then
   select coalesce(max((x->>'id')::bigint),0)+1 into new_id from jsonb_array_elements(arr) x where (x->>'id') ~ '^[0-9]+$';
   item := (p_payload - 'id') || jsonb_build_object('id',new_id);
   updated := arr || jsonb_build_array(item);
 else
   select exists(select 1 from jsonb_array_elements(arr) x where x->>'id'=p_id) into found;
   if not found then raise exception 'ID not found'; end if;
   if p_action='PUT' then
     select jsonb_agg(case when x->>'id'=p_id then x || (p_payload - 'id') else x end)
       into updated from jsonb_array_elements(arr) x;
     select x into item from jsonb_array_elements(updated) x where x->>'id'=p_id limit 1;
   else
     select coalesce(jsonb_agg(x),'[]'::jsonb) into updated from jsonb_array_elements(arr) x where x->>'id'<>p_id;
     item := jsonb_build_object('deleted',true,'id',p_id);
   end if;
 end if;
 update public.app_data set data = jsonb_set(doc, array[p_resource], updated, true) where id=1;
 return item;
end; $$;
revoke execute on function public.marwa_mutate_resource(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.marwa_mutate_resource(text,text,text,jsonb) to service_role;
