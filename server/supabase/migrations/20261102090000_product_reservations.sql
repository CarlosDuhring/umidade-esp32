-- Lista de intencao para o primeiro lote do produto.
-- A landing nao processa pagamento; guarda apenas o contato e o kit de interesse.
create table if not exists public.product_reservations (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 254),
  whatsapp text,
  plan text not null default 'casa' check (plan in ('one', 'casa', 'horta')),
  source text not null default 'landing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists product_reservations_email_key
  on public.product_reservations (email);

alter table public.product_reservations enable row level security;
revoke all on public.product_reservations from anon, authenticated;
