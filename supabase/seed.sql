-- Equipo de ejemplo. Edítalo desde el dashboard (página Equipo) o borra estas filas.
insert into public.team_members (name, email, specialties, capacity_points) values
  ('Ana (ejemplo)',   'ana@ejemplo.com',   '{"Marketing digital"}', 10),
  ('Diego (ejemplo)', 'diego@ejemplo.com', '{"Diseño"}',            10),
  ('Carla (ejemplo)', 'carla@ejemplo.com', '{"Finanzas"}',          6),
  ('Tomás (ejemplo)', 'tomas@ejemplo.com', '{"Operaciones"}',       10)
on conflict (email) do nothing;
