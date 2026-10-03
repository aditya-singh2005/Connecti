CREATE OR REPLACE FUNCTION public.clear_active_zone_user_coordinates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.latitude := NULL;
  NEW.longitude := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_active_zone_user_coordinates() FROM PUBLIC;

DROP TRIGGER IF EXISTS clear_active_zone_user_coordinates ON public.active_zone_users;

CREATE TRIGGER clear_active_zone_user_coordinates
BEFORE INSERT OR UPDATE ON public.active_zone_users
FOR EACH ROW
EXECUTE FUNCTION public.clear_active_zone_user_coordinates();

UPDATE public.active_zone_users
SET latitude = NULL,
    longitude = NULL
WHERE latitude IS NOT NULL OR longitude IS NOT NULL;