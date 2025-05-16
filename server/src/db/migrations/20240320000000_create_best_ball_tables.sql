-- Create best_ball_player_scores table
create table best_ball_player_scores (
  id serial primary key,
  match_id integer references matches(id),
  player_id integer references players(id),
  hole_number integer,
  score integer,
  handicap_strokes integer default 0,
  net_score integer,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(match_id, player_id, hole_number)
);

-- Create best_ball_matches table
create table best_ball_matches (
  id serial primary key,
  round_id integer references rounds(id),
  team1_id integer references teams(id),
  team2_id integer references teams(id),
  team1_score integer default 0,
  team2_score integer default 0,
  status text check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_best_ball_player_scores_updated_at
  before update on best_ball_player_scores
  for each row
  execute function update_updated_at_column();

create trigger update_best_ball_matches_updated_at
  before update on best_ball_matches
  for each row
  execute function update_updated_at_column(); 