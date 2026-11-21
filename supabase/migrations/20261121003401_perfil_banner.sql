-- Banner opcional do perfil. Mantém os dados e as políticas de proprietário.
ALTER TABLE public.jogadores ADD COLUMN IF NOT EXISTS banner_url text;
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.jogadores'::regclass AND conname='jogadores_banner_url_check'
  ) THEN
    ALTER TABLE public.jogadores ADD CONSTRAINT jogadores_banner_url_check
    CHECK (banner_url IS NULL OR banner_url='' OR
      (length(banner_url)<=2048 AND banner_url ~* '^https?://[^[:space:]]+$'));
  END IF;
END;
$constraint$;
GRANT UPDATE (banner_url) ON public.jogadores TO authenticated;
NOTIFY pgrst, 'reload schema';
