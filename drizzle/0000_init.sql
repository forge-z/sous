CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  quantity numeric(12, 3),
  unit text NOT NULL DEFAULT 'unit',
  quantity_state text,
  category text NOT NULL DEFAULT 'other',
  location text NOT NULL DEFAULT 'pantry',
  expires_at date,
  opened_at date,
  priority text NOT NULL DEFAULT 'normal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_priority_check CHECK (priority IN ('normal', 'use_soon', 'urgent')),
  CONSTRAINT inventory_location_check CHECK (location IN ('fridge', 'freezer', 'pantry', 'drinks', 'other')),
  CONSTRAINT inventory_quantity_state_check CHECK (quantity_state IS NULL OR quantity_state IN ('full', 'enough', 'half', 'low', 'almost_empty', 'empty'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_name_location_unit_idx ON inventory_items(normalized_name, location, unit);
CREATE INDEX IF NOT EXISTS inventory_items_priority_idx ON inventory_items(priority);
CREATE INDEX IF NOT EXISTS inventory_items_expiry_idx ON inventory_items(expires_at);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'consume', 'discard', 'adjust', 'empty')),
  quantity numeric(12, 3),
  unit text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL,
  quantity numeric(12, 3),
  unit text NOT NULL DEFAULT 'unit',
  checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shopping_items_checked_idx ON shopping_items(checked, created_at);
