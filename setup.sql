-- ============================================
-- fredd 的个人任务系统 - Supabase 数据库初始化
-- ============================================
-- 使用方法：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 粘贴本文件全部内容并执行

-- 待办事项表
CREATE TABLE todos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium' 
    CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
  category TEXT NOT NULL DEFAULT 'work'
    CHECK (category IN ('family', 'work', 'personal', 'other')),
  due_date TIMESTAMPTZ,
  is_longterm BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed')),
  is_archived BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  subtasks JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 索引优化查询性能
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_priority ON todos(priority);
CREATE INDEX idx_todos_archived ON todos(is_archived);
CREATE INDEX idx_todos_sort ON todos(sort_order);
CREATE INDEX idx_todos_category ON todos(category);
CREATE INDEX idx_todos_due_date ON todos(due_date);

-- RLS 策略（公开读写 - 个人使用，无需认证）
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read" ON todos
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public insert" ON todos
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow public update" ON todos
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow public delete" ON todos
  FOR DELETE TO anon, authenticated USING (true);

-- 开启实时推送（Realtime）
ALTER PUBLICATION supabase_realtime ADD TABLE todos;

-- ============================================
-- 已完成事项自动归档
-- ============================================

-- 状态变更时自动维护 completed_at
CREATE OR REPLACE FUNCTION update_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status != 'completed' OR OLD.status IS NULL) THEN
    NEW.completed_at = now();
  ELSIF NEW.status = 'active' AND OLD.status = 'completed' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS todos_completed_at ON todos;
CREATE TRIGGER todos_completed_at
  BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_completed_at();

-- 索引优化归档查询
CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at);

-- pg_cron：每日凌晨3点自动归档（已完成且超过3天未变更）
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'auto-archive-completed',
  '0 3 * * *',
  $$UPDATE todos SET is_archived = true WHERE status = 'completed' AND is_archived = false AND completed_at < now() - interval '3 days'$$
);

-- ============================================
-- 以下为已有数据库的迁移脚本（新部署无需执行）
-- ============================================
-- ALTER TABLE todos ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
-- UPDATE todos SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

-- 「长期」任务字段迁移（2026-07-20）
-- ALTER TABLE todos ADD COLUMN IF NOT EXISTS is_longterm BOOLEAN DEFAULT false;

-- ============================================
-- 完成！现在可以在前端通过 Supabase SDK 访问数据了
-- ============================================
