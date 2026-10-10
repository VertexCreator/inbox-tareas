-- Las prioridades del admin viven en la base (no en un archivo local) para que el agente
-- funcione igual desde cualquier computadora y se editen desde el dashboard.
-- Tabla aparte de settings porque settings la lee todo el equipo y esto (VIPs, temas) es privado.

create table public.agent_priorities (
  id int primary key default 1 check (id = 1),
  content text not null,
  updated_at timestamptz not null default now()
);

insert into public.agent_priorities (content) values ($md$## Remitentes VIP (siempre P1 si piden algo)
- (agrega correos o dominios, ej. jefe@dimassicorp.com, @clienteimportante.com)

## Temas que son P1
- Pagos, facturas vencidas, bancos que piden acción
- Contratos o documentos para firmar
- Clientes que piden respuesta con fecha límite hoy o mañana

## Temas que son P2
- Feedback que espera el equipo
- Hilos con más de 2 días sin mi respuesta
- Cotizaciones y propuestas

## Basura: nunca P1/P2, solo contar
- Promociones, newsletters que no leo, notificaciones automáticas de apps

## Categorías que uso
Clientes, Equipo, Finanzas, Proveedores, Legal, Newsletters, Promociones, Notificaciones, Otros

## Cuándo crear tareas para el equipo
- Cuando el correo pide un trabajo que no tengo que hacer yo (diseño, campañas, reportes, gestiones).
- No crear tareas para correos que solo requieren mi respuesta.
$md$);

alter table public.agent_priorities enable row level security;
revoke all on public.agent_priorities from anon;
revoke insert, delete on public.agent_priorities from authenticated;

create policy priorities_select on public.agent_priorities for select to authenticated using (public.is_admin());
create policy priorities_update on public.agent_priorities for update to authenticated using (public.is_admin()) with check (public.is_admin());
