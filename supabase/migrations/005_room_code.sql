-- =============================================================
-- ルームコード（英数字6文字）追加
-- UUID の代わりにユーザーが共有しやすい短いコードを使用
-- =============================================================

ALTER TABLE rooms ADD COLUMN room_code TEXT UNIQUE;

-- 既存のルームにもコードを付与（空の場合）
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;
