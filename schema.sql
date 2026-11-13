CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '行业动态',
  summary TEXT,
  technical_analysis TEXT,
  industry_impact TEXT,
  importance INTEGER NOT NULL DEFAULT 3,
  ai_model TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);
