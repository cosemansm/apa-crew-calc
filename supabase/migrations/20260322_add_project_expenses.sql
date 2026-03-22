-- Create project_expenses table
CREATE TABLE IF NOT EXISTS project_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  category    text NOT NULL DEFAULT 'other',
  expense_date date,
  created_at  timestamptz DEFAULT now()
);

-- Row Level Security
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expenses"
  ON project_expenses FOR ALL
  USING (auth.uid() = user_id);
