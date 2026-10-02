-- =====================================================================
-- Protocolo QR da Câmara — banco de dados (Supabase / Postgres)
-- Cole TUDO isto no Supabase: menu "SQL Editor" → "New query" → Run.
-- Pode rodar de novo sem problema (não apaga dados).
-- =====================================================================

-- 1) Tabela de protocolos -------------------------------------------------
create table if not exists public.protocolos (
  id           bigint generated always as identity primary key,
  protocolo    text        not null,                 -- ex.: 2026/0001 (a retificação repete o número)
  versao       int         not null default 0,       -- 0 = original; 1, 2... = retificações
  retifica_em  timestamptz,                          -- retificação: data/hora do protocolo original
  motivo       text,                                 -- retificação: o que mudou
  recebido_em  timestamptz not null default now(),   -- hora do servidor (não dá para alterar)
  direcao      text        not null default 'RECEBIDO',   -- RECEBIDO (entrou na Câmara) ou ENVIADO (saiu dos vereadores)
  procedencia  text        not null default 'PREFEITURA', -- PREFEITURA (etiqueta QR), TERCEIROS ou CAMARA (envio)
  tipo         text        not null,                 -- PL, PLC, LEI, DEC, MV, OF, PC, REQ, OP, OUT
  numero       text,                                 -- vazio para documentos de terceiros
  ano          text        not null,
  data_doc     date,
  autor        text,                                 -- origem (recebidos) ou vereador(a) (enviados)
  destinatario text,                                 -- só nos enviados
  assunto      text,
  recebido_por text        not null,
  usuario_id   uuid        default auth.uid(),       -- conta que estava logada
  busca        text                                  -- texto sem acento para a pesquisa
);

-- Atualiza bancos criados com a versão anterior (pode rodar sempre)
alter table public.protocolos add column if not exists procedencia text not null default 'PREFEITURA';
alter table public.protocolos alter column numero drop not null;
alter table public.protocolos add column if not exists direcao text not null default 'RECEBIDO';
alter table public.protocolos add column if not exists destinatario text;
alter table public.protocolos add column if not exists versao int not null default 0;
alter table public.protocolos add column if not exists retifica_em timestamptz;
alter table public.protocolos add column if not exists motivo text;
-- O número do protocolo agora pode se repetir, mas só com versão diferente (retificação)
alter table public.protocolos drop constraint if exists protocolos_protocolo_key;
create unique index if not exists protocolos_prot_versao_idx on public.protocolos (protocolo, versao);

create index if not exists protocolos_recebido_em_idx on public.protocolos (recebido_em desc);
create index if not exists protocolos_doc_idx         on public.protocolos (tipo, numero, ano);

-- 2) Contador anual (garante numeração sem buracos nem repetição) -------
create table if not exists public.contador_protocolo (
  ano    int primary key,
  ultimo int not null default 0
);

-- 3) Função auxiliar: tira acentos e põe em minúsculas -------------------
create or replace function public.sem_acento(t text)
returns text language sql immutable as $$
  select lower(translate(coalesce(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
$$;

-- 4) Registrar protocolo: número + data/hora definidos pelo servidor ------
drop function if exists public.registrar_protocolo(text,text,text,date,text,text,text);
create or replace function public.registrar_protocolo(
  p_tipo text, p_numero text, p_ano text, p_data_doc date,
  p_autor text, p_assunto text, p_recebido_por text,
  p_procedencia text default 'PREFEITURA'
) returns public.protocolos
language plpgsql security definer set search_path = public as $$
declare
  v_agora timestamptz := now();
  v_hoje  date := (v_agora at time zone 'America/Sao_Paulo')::date;
  v_ano   int := extract(year from v_hoje);
  v_proc  text := upper(coalesce(nullif(trim(p_procedencia),''), 'PREFEITURA'));
  v_seq   int;
  v_prot  text;
  v_row   public.protocolos;
begin
  if auth.uid() is null then
    raise exception 'Faça login para registrar protocolos.';
  end if;
  if v_proc not in ('PREFEITURA','TERCEIROS') then
    raise exception 'Procedência inválida.';
  end if;
  if coalesce(trim(p_tipo),'') = '' then
    raise exception 'Informe o tipo do documento.';
  end if;
  if v_proc = 'PREFEITURA' and upper(trim(p_tipo)) not in ('OUT','PC') and coalesce(trim(p_numero),'') = '' then
    raise exception 'Informe o número do documento.';
  end if;
  if v_proc = 'TERCEIROS' and coalesce(trim(p_autor),'') = '' then
    raise exception 'Informe a origem (pessoa ou órgão que entregou).';
  end if;
  if coalesce(trim(p_recebido_por),'') = '' then
    raise exception 'Informe o nome de quem está recebendo.';
  end if;

  insert into contador_protocolo as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;
  v_prot := v_ano || '/' || lpad(v_seq::text, 4, '0');

  insert into protocolos (protocolo, recebido_em, procedencia, tipo, numero, ano, data_doc,
                          autor, assunto, recebido_por, usuario_id, busca)
  values (v_prot, v_agora, v_proc, upper(trim(p_tipo)),
          nullif(trim(p_numero),''),
          -- terceiros: data e ano do documento = dia do recebimento
          case when v_proc = 'TERCEIROS' then v_ano::text else trim(coalesce(p_ano,'')) end,
          case when v_proc = 'TERCEIROS' then v_hoje else p_data_doc end,
          nullif(trim(p_autor),''), nullif(trim(p_assunto),''), trim(p_recebido_por),
          auth.uid(),
          sem_acento(concat_ws(' ', v_prot, v_proc, p_tipo,
                     case when coalesce(trim(p_numero),'') <> '' then p_tipo || ' ' || p_numero || ' ' || p_numero || '/' || p_ano end,
                     p_autor, p_assunto, p_recebido_por)))
  returning * into v_row;

  return v_row;
end $$;

-- 4b) Registrar envio: vereadores protocolam ofícios/requerimentos para fora --
create or replace function public.registrar_envio(
  p_tipo text, p_numero text, p_vereador text, p_destinatario text,
  p_assunto text, p_registrado_por text
) returns public.protocolos
language plpgsql security definer set search_path = public as $$
declare
  v_agora timestamptz := now();
  v_hoje  date := (v_agora at time zone 'America/Sao_Paulo')::date;
  v_ano   int := extract(year from v_hoje);
  v_tipo  text := upper(trim(coalesce(p_tipo,'')));
  v_seq   int;
  v_prot  text;
  v_row   public.protocolos;
begin
  if auth.uid() is null then
    raise exception 'Faça login para registrar protocolos.';
  end if;
  if v_tipo = '' then
    raise exception 'Informe o tipo do documento.';
  end if;
  if v_tipo = 'OF' and coalesce(trim(p_numero),'') = '' then
    raise exception 'Informe o número do ofício.';
  end if;
  if coalesce(trim(p_vereador),'') = '' then
    raise exception 'Informe o vereador ou a vereadora.';
  end if;
  if coalesce(trim(p_destinatario),'') = '' then
    raise exception 'Informe o destinatário.';
  end if;
  if coalesce(trim(p_registrado_por),'') = '' then
    raise exception 'Informe o nome de quem está registrando.';
  end if;

  insert into contador_protocolo as c (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = c.ultimo + 1
    returning ultimo into v_seq;
  v_prot := v_ano || '/' || lpad(v_seq::text, 4, '0');

  insert into protocolos (protocolo, recebido_em, direcao, procedencia, tipo, numero, ano, data_doc,
                          autor, destinatario, assunto, recebido_por, usuario_id, busca)
  values (v_prot, v_agora, 'ENVIADO', 'CAMARA', v_tipo,
          case when v_tipo = 'OF' then trim(p_numero) else nullif(trim(p_numero),'') end,
          v_ano::text, v_hoje,
          trim(p_vereador), trim(p_destinatario), nullif(trim(p_assunto),''), trim(p_registrado_por),
          auth.uid(),
          sem_acento(concat_ws(' ', v_prot, 'enviado', v_tipo,
                     case when coalesce(trim(p_numero),'') <> '' then v_tipo || ' ' || p_numero || ' ' || p_numero || '/' || v_ano end,
                     p_vereador, p_destinatario, p_assunto, p_registrado_por)))
  returning * into v_row;

  return v_row;
end $$;

-- 4c) Retificação: documento que voltou alterado, com o MESMO número de protocolo --
--     O registro original continua intacto; a retificação entra como nova versão.
create or replace function public.registrar_retificacao(
  p_original bigint, p_tipo text, p_numero text, p_ano text, p_data_doc date,
  p_autor text, p_assunto text, p_motivo text, p_recebido_por text
) returns public.protocolos
language plpgsql security definer set search_path = public as $$
declare
  v_agora  timestamptz := now();
  v_orig   public.protocolos;
  v_prim   public.protocolos;
  v_versao int;
  v_tipo   text := upper(trim(coalesce(p_tipo,'')));
  v_row    public.protocolos;
begin
  if auth.uid() is null then
    raise exception 'Faça login para registrar protocolos.';
  end if;
  if coalesce(trim(p_recebido_por),'') = '' then
    raise exception 'Informe o nome de quem está recebendo.';
  end if;
  if v_tipo = '' then
    raise exception 'Informe o tipo do documento.';
  end if;

  select * into v_orig from protocolos where id = p_original;
  if not found then
    raise exception 'Protocolo original não encontrado.';
  end if;
  if v_orig.direcao <> 'RECEBIDO' then
    raise exception 'Só documentos recebidos podem ser retificados.';
  end if;

  -- uma retificação de cada vez para o mesmo protocolo (evita versão repetida)
  perform pg_advisory_xact_lock(hashtext('retificacao:' || v_orig.protocolo));
  select * into v_prim from protocolos where protocolo = v_orig.protocolo order by versao limit 1;
  select coalesce(max(versao),0) + 1 into v_versao from protocolos where protocolo = v_orig.protocolo;

  insert into protocolos (protocolo, versao, retifica_em, motivo, recebido_em, direcao, procedencia,
                          tipo, numero, ano, data_doc, autor, assunto, recebido_por, usuario_id, busca)
  values (v_prim.protocolo, v_versao, v_prim.recebido_em, nullif(trim(p_motivo),''), v_agora,
          'RECEBIDO', v_prim.procedencia, v_tipo,
          nullif(trim(p_numero),''),
          case when v_prim.procedencia = 'TERCEIROS' then v_prim.ano else coalesce(nullif(trim(p_ano),''), v_prim.ano) end,
          case when v_prim.procedencia = 'TERCEIROS' then v_prim.data_doc else coalesce(p_data_doc, v_prim.data_doc) end,
          nullif(trim(p_autor),''), nullif(trim(p_assunto),''), trim(p_recebido_por),
          auth.uid(),
          sem_acento(concat_ws(' ', v_prim.protocolo, v_prim.procedencia, 'retificacao retificado', v_tipo,
                     case when coalesce(trim(p_numero),'') <> '' then v_tipo || ' ' || p_numero || ' ' || p_numero || '/' || p_ano end,
                     p_autor, p_assunto, p_motivo, p_recebido_por)))
  returning * into v_row;

  return v_row;
end $$;

-- 5) Meses que têm protocolos (para o seletor de período) -----------------
create or replace function public.meses_com_protocolo()
returns table (mes text)
language sql stable security invoker set search_path = public as $$
  select distinct to_char(recebido_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes
  from protocolos order by 1 desc
$$;

-- 6) Segurança: só quem está logado vê; ninguém edita nem apaga ------------
alter table public.protocolos         enable row level security;
alter table public.contador_protocolo enable row level security;

drop policy if exists "logados podem ler" on public.protocolos;
create policy "logados podem ler" on public.protocolos
  for select to authenticated using (true);
-- Sem políticas de insert/update/delete: gravar só pela função acima,
-- e protocolos registrados não podem ser alterados nem apagados pelo site.

revoke all on function public.registrar_protocolo(text,text,text,date,text,text,text,text) from public, anon;
grant execute on function public.registrar_protocolo(text,text,text,date,text,text,text,text) to authenticated;
revoke all on function public.registrar_envio(text,text,text,text,text,text) from public, anon;
grant execute on function public.registrar_envio(text,text,text,text,text,text) to authenticated;
revoke all on function public.registrar_retificacao(bigint,text,text,text,date,text,text,text,text) from public, anon;
grant execute on function public.registrar_retificacao(bigint,text,text,text,date,text,text,text,text) to authenticated;
revoke all on function public.meses_com_protocolo() from public, anon;
grant execute on function public.meses_com_protocolo() to authenticated;
