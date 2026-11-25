-- Habilita Row Level Security en todas las tablas del esquema public.
-- Sin políticas, los roles expuestos por la API de Supabase (anon, authenticated)
-- no pueden leer ni escribir nada. El backend se conecta como dueño de las tablas
-- (postgres), que no está sujeto a RLS, así que su funcionamiento no cambia.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
