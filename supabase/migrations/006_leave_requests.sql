-- =============================================================
-- 退出リクエスト＋投票システム
-- ゲーム中の退出は全員の同意が必要
-- =============================================================

-- 退出リクエストテーブル
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  requester_id UUID REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 退出投票テーブル
CREATE TABLE leave_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES players(id) ON DELETE CASCADE,
  approved BOOLEAN NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(leave_request_id, voter_id)
);

-- インデックス
CREATE INDEX idx_leave_requests_room_id ON leave_requests(room_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(room_id, status);
CREATE INDEX idx_leave_votes_request_id ON leave_votes(leave_request_id);

-- Realtime 有効化
ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE leave_votes;

-- RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_requests_select_authenticated"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "leave_requests_all_service_role"
  ON leave_requests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "leave_votes_select_authenticated"
  ON leave_votes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "leave_votes_all_service_role"
  ON leave_votes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
