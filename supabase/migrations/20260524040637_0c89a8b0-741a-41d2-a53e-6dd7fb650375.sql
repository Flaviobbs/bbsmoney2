create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  -- Default expense categories (12 principais, cores únicas)
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Alimentação',        'expense', '#f97316', 'Utensils'),
    (new.id, 'Supermercado',       'expense', '#16a34a', 'ShoppingCart'),
    (new.id, 'Moradia',            'expense', '#0ea5e9', 'Home'),
    (new.id, 'Transporte',         'expense', '#14b8a6', 'Car'),
    (new.id, 'Saúde',              'expense', '#ef4444', 'HeartPulse'),
    (new.id, 'Educação',           'expense', '#eab308', 'GraduationCap'),
    (new.id, 'Lazer',              'expense', '#a855f7', 'Gamepad2'),
    (new.id, 'Compras',            'expense', '#ec4899', 'ShoppingBag'),
    (new.id, 'Assinaturas',        'expense', '#8b5cf6', 'Repeat'),
    (new.id, 'Contas e Serviços',  'expense', '#6366f1', 'Receipt'),
    (new.id, 'Pets',               'expense', '#f59e0b', 'PawPrint'),
    (new.id, 'Outros',             'expense', '#64748b', 'Tag');

  -- Default income categories
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Salário',         'income', '#22c55e', 'Briefcase'),
    (new.id, 'Freelance',       'income', '#a855f7', 'Laptop'),
    (new.id, 'Investimentos',   'income', '#0ea5e9', 'TrendingUp'),
    (new.id, 'Outras receitas', 'income', '#64748b', 'PlusCircle');

  -- Default account
  insert into public.accounts (user_id, name, type, initial_balance, color)
  values (new.id, 'Conta Principal', 'checking', 0, '#a855f7');

  return new;
end;
$$;