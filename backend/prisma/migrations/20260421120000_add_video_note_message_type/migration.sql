DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'VIDEO_NOTE'
      AND enumtypid = '"MessageType"'::regtype
  ) THEN
    ALTER TYPE "MessageType" ADD VALUE 'VIDEO_NOTE';
  END IF;
END $$;
