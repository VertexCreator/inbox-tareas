-- Si nadie tiene la habilidad, no se recomienda a cualquiera: queda sin asignar para que decida el admin.
-- En tareas generales se prefiere al equipo antes que a los administradores.
create or replace function public.recommend_member(p_skill text, p_template uuid, p_text text)
returns table (member_id uuid, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_threshold numeric := (select saturation_threshold from public.settings where id = 1);
  r record;
begin
  if p_text is not null then
    select ar.member_id as mid, ar.keyword into r
    from public.assignment_rules ar join public.team_members m on m.id = ar.member_id
    where ar.active and m.active and m.available and position(ar.keyword in lower(p_text)) > 0
    order by length(ar.keyword) desc limit 1;
    if found then
      return query select r.mid, format('Regla aprendida: "%s"', r.keyword);
      return;
    end if;
  end if;

  if p_template is not null and p_skill is not null then
    select pp.member_id as mid, l.load_ratio into r
    from public.plan_preferences pp join public.member_load l on l.id = pp.member_id
    where pp.template_id = p_template and pp.skill = p_skill and l.active and l.available;
    if found then
      return query select r.mid, format('Tu preferencia para %s en esta plantilla · carga %s%%', p_skill, round(r.load_ratio * 100));
      return;
    end if;
  end if;

  if p_skill is not null then
    select l.id as mid, l.load_ratio, (l.skill_levels ->> p_skill)::int as lvl into r
    from public.member_load l
    where l.active and l.available and l.skill_levels ? p_skill
    order by (l.load_ratio >= v_threshold), (l.skill_levels ->> p_skill)::int desc, l.load_ratio, l.open_tasks
    limit 1;
    if found then
      return query select r.mid, format('%s nivel %s · carga %s%%%s', p_skill, public.level_label(r.lvl),
        round(r.load_ratio * 100), case when r.load_ratio >= v_threshold then ' · saturado' else '' end);
    else
      return query select null::uuid, format('Nadie del equipo tiene %s · elige tú', p_skill);
    end if;
    return;
  end if;

  select l.id as mid, l.load_ratio into r
  from public.member_load l where l.active and l.available
  order by l.is_admin, l.load_ratio, l.open_tasks limit 1;
  if found then
    return query select r.mid, format('Tarea general · menor carga (%s%%)', round(r.load_ratio * 100));
  end if;
end
$$;
revoke execute on function public.recommend_member(text, uuid, text) from public, anon, authenticated;
