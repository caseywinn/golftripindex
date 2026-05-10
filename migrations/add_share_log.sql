CREATE TABLE IF NOT EXISTS share_log (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_log_ip_created_idx ON share_log (ip, created_at);
