-- ═══════════════════════════════════════════════════════════════════════
--  TSUKI · Migração de nomes no Supabase
-- ═══════════════════════════════════════════════════════════════════════
--    Lucas  ->  Clarinha   (TODO o histórico é preservado)
--    Pedro  ->  "Ausente"  (vaga sem pessoa: sai da tabela, com backup)
--
--  ONDE RODAR
--    Supabase Dashboard → SQL Editor → New query → colar tudo → Run
--
--  É IDEMPOTENTE: pode rodar mais de uma vez sem estragar nada.
--  Não é urgente: o site já converte os nomes antigos na leitura
--  (veja NOMES_LEGADOS em js/config.js). Esta migração só deixa o
--  banco limpo e coerente com a interface.
--
--  Resultado esperado ao final: 4 nomes (Vinicius, Matheus, Clarinha,
--  João) somando 43 registros — os 10 do Pedro ficam guardados na
--  tabela de backup.
-- ═══════════════════════════════════════════════════════════════════════

-- 0) Sanity check: a tabela precisa existir
do $$
begin
  if to_regclass('public.pagamentos') is null then
    raise exception 'Tabela public.pagamentos não encontrada. Confira se está no projeto Supabase certo.';
  end if;
end
$$;

begin;

-- 1) BACKUP de tudo que será renomeado ou removido (nada se perde)
create table if not exists public.pagamentos_backup_nomes as
  select * from public.pagamentos where false;   -- copia só a estrutura

insert into public.pagamentos_backup_nomes
  select * from public.pagamentos
   where pessoa in ('Pedro', 'Lucas');

-- 2) Remove CHECK constraints que citam a coluna "pessoa"
--    (se existirem, o UPDATE abaixo seria bloqueado pela lista antiga de nomes)
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.pagamentos'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%pessoa%'
  loop
    execute format('alter table public.pagamentos drop constraint %I', c.conname);
    raise notice 'CHECK removida: %', c.conname;
  end loop;
end
$$;

-- 3) Deduplica eventuais repetições dentro do próprio "Lucas"
delete from public.pagamentos a
 using public.pagamentos b
 where a.pessoa = 'Lucas'
   and b.pessoa = 'Lucas'
   and a.mes = b.mes
   and a.ano = b.ano
   and a.ctid > b.ctid;

-- 4) Lucas -> Clarinha (só quando ainda não existe Clarinha naquele mês/ano)
update public.pagamentos p
   set pessoa = 'Clarinha'
 where p.pessoa = 'Lucas'
   and not exists (
         select 1
           from public.pagamentos q
          where q.pessoa = 'Clarinha'
            and q.mes = p.mes
            and q.ano = p.ano
       );

-- 5) O que sobrou de "Lucas" era duplicado de um mês já pago pela Clarinha
delete from public.pagamentos where pessoa = 'Lucas';

-- 6) Pedro virou VAGA ("Ausente"): vaga não tem pagamento, então sai da tabela
--    (as linhas continuam guardadas em pagamentos_backup_nomes)
delete from public.pagamentos where pessoa in ('Pedro', 'Ausente');

commit;

-- 7) Conferência final
select pessoa, count(*) as registros, min(mes) as primeiro_mes, max(mes) as ultimo_mes
  from public.pagamentos
 group by pessoa
 order by pessoa;

select count(*) as linhas_no_backup from public.pagamentos_backup_nomes;

-- ═══════════════════════════════════════════════════════════════════════
--  PARA DESFAZER a troca de nomes (registros criados depois continuam valendo):
--
--  begin;
--  update public.pagamentos set pessoa = 'Lucas' where pessoa = 'Clarinha';
--  insert into public.pagamentos (pessoa, mes, ano, pago)
--  select b.pessoa, b.mes, b.ano, b.pago
--    from public.pagamentos_backup_nomes b
--   where not exists (select 1 from public.pagamentos p
--                      where p.pessoa = b.pessoa and p.mes = b.mes and p.ano = b.ano);
--  commit;
-- ═══════════════════════════════════════════════════════════════════════
