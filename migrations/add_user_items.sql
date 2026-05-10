CREATE TABLE IF NOT EXISTS user_items (
  user_id    TEXT        NOT NULL,
  item_type  TEXT        NOT NULL,
  item_id    TEXT        NOT NULL,
  status     TEXT        NOT NULL CHECK (status IN ('wishlist', 'played')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS user_items_user_idx ON user_items (user_id);
