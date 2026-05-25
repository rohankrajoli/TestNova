create table if not exists quizzes (
  id serial primary key,
  title text not null,
  description text not null,
  time_limit_seconds integer not null,
  is_published boolean not null default false,
  start_at timestamp,
  end_at timestamp,
  created_at timestamp not null default now(),
  updated_at timestamp not null default now()
);

alter table quizzes add column if not exists start_at timestamp;
alter table quizzes add column if not exists end_at timestamp;

create table if not exists questions (
  id serial primary key,
  quiz_id integer not null references quizzes(id) on delete cascade,
  text text not null,
  options jsonb not null,
  correct_index integer not null,
  explanation text default '',
  order_index integer not null
);

create table if not exists attempts (
  id serial primary key,
  quiz_id integer not null references quizzes(id) on delete cascade,
  user_name text not null,
  score integer not null,
  total_questions integer not null,
  time_taken_seconds integer not null,
  answers jsonb not null,
  completed_at timestamp not null default now()
);
