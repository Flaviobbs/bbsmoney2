
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_alim uuid;
  v_lazer uuid;
  v_saude uuid;
  v_transp uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  -- Expense parents (cores únicas)
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Alimentação',           'expense', '#f97316', 'Utensils')        returning id into v_alim;
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Beleza',                 'expense', '#ec4899', 'Sparkles'),
    (new.id, 'Compras',                'expense', '#d946ef', 'ShoppingBag'),
    (new.id, 'Crypto',                 'expense', '#eab308', 'Bitcoin'),
    (new.id, 'Educação',              'expense', '#3b82f6', 'GraduationCap');
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Lazer',                  'expense', '#a855f7', 'Gamepad2')       returning id into v_lazer;
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Lazer - Viagens',        'expense', '#8b5cf6', 'Plane'),
    (new.id, 'Moradia',                'expense', '#0ea5e9', 'Home');
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Saúde',                 'expense', '#ef4444', 'HeartPulse')      returning id into v_saude;
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Taxas, impostos, juros', 'expense', '#6366f1', 'Receipt');
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Transporte',             'expense', '#14b8a6', 'Car')            returning id into v_transp;
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Outros',                 'expense', '#64748b', 'Tag');

  -- Subcategorias de Alimentação
  insert into public.categories (user_id, name, type, color, icon, parent_id) values
    (new.id, 'Feira',                'expense', '#fb923c', 'Apple',        v_alim),
    (new.id, 'Padaria',              'expense', '#facc15', 'Croissant',    v_alim),
    (new.id, 'Restaurante',          'expense', '#f97316', 'UtensilsCrossed', v_alim),
    (new.id, 'Supermercado',         'expense', '#16a34a', 'ShoppingCart', v_alim),
    (new.id, 'Lanches e Besteiras',  'expense', '#fdba74', 'Cookie',       v_alim);

  -- Subcategorias de Lazer
  insert into public.categories (user_id, name, type, color, icon, parent_id) values
    (new.id, 'Diversão', 'expense', '#c084fc', 'PartyPopper', v_lazer),
    (new.id, 'Esportes', 'expense', '#7c3aed', 'Dumbbell',    v_lazer);

  -- Subcategorias de Saúde
  insert into public.categories (user_id, name, type, color, icon, parent_id) values
    (new.id, 'Equipamentos', 'expense', '#f87171', 'Stethoscope', v_saude),
    (new.id, 'Farmácia',    'expense', '#fb7185', 'Pill',        v_saude),
    (new.id, 'Médicos',     'expense', '#dc2626', 'UserRound',   v_saude);

  -- Subcategorias de Transporte
  insert into public.categories (user_id, name, type, color, icon, parent_id) values
    (new.id, 'Aplicativos',  'expense', '#2dd4bf', 'Smartphone', v_transp),
    (new.id, 'Carro',        'expense', '#0d9488', 'Car',        v_transp),
    (new.id, 'Combustível', 'expense', '#5eead4', 'Fuel',       v_transp);

  -- Income categories (cores únicas)
  insert into public.categories (user_id, name, type, color, icon) values
    (new.id, 'Salário',                 'income', '#22c55e', 'Briefcase'),
    (new.id, 'Freelance',                'income', '#06b6d4', 'Laptop'),
    (new.id, 'Bolsas e Financiamento',   'income', '#84cc16', 'GraduationCap'),
    (new.id, 'Outros',                   'income', '#64748b', 'PlusCircle');

  -- Default account
  insert into public.accounts (user_id, name, type, initial_balance, color)
  values (new.id, 'Conta Principal', 'checking', 0, '#a855f7');

  return new;
end;
$function$;
