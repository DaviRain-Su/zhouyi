CREATE TABLE IF NOT EXISTS hexagrams (
    address     TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    yaos        TEXT NOT NULL,        -- JSON array [6,7,8,9,7,8]
    derived     TEXT NOT NULL,        -- JSON array after flip
    flipped     INTEGER NOT NULL DEFAULT 0,
    slot        INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_owner ON hexagrams(owner);
