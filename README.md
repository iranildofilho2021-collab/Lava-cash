# LAVACASH — correção Supabase e migração de hospedagem

Esta branch prepara a versão atual para GitHub Pages. **Ainda não houve troca de hospedagem, alteração no banco nem desligamento do Firebase.**

O conteúdo atual está em `site/`, recuperado dos arquivos públicos de `https://lavacash-financeiro.web.app/` em 03/11/2026. Os arquivos antigos da raiz foram preservados. A origem e os hashes anteriores às correções estão em `docs/origem-site.json`.

## Alterações

- Despesas só exibem sucesso após confirmação da API. Edições usam PATCH condicionado à versão; registros excluídos no servidor não são recriados pelo formulário.
- Exclusões usam os IDs selecionados e a lavanderia, com conferência da resposta. Os chamadores em Receitas foram adaptados e não tratam uma operação pendente como concluída.
- A fila preserva o conteúdo e a conta de cada operação e não perde entradas acrescentadas durante uma sincronização. Pendências antigas sem conteúdo ficam preservadas para revisão.
- A leitura de despesas, o painel móvel e os fluxos de reconciliação de Receitas usam a resposta remota, preservando divergências em cópias locais de recuperação.
- Recorrências são geradas explicitamente na tela Despesas. Dashboard e Análise não criam registros durante a leitura. É preciso validar uma estratégia de ocorrências/exclusões no banco antes de reativar geração automática.
- Links, redirecionamentos, manifesto e Service Worker funcionam em `/Lava-cash/`. Links antigos sem extensão têm redirecionamento limitado às páginas conhecidas. O Service Worker preserva caches de outros projetos no mesmo domínio GitHub.
- O build publica somente `site/`, sem testes, SQL, documentos ou os arquivos antigos da raiz. Actions estão fixadas por SHA.

## Validação local

Requer Node.js 22 ou superior, sem dependências npm:

```sh
node --test tests/*.cjs
node scripts/build-pages.mjs
```

Os testes usam dados sintéticos e respostas simuladas. Não comprovam permissões, estrutura ou gravação no banco de produção. A interface autenticada ainda precisa ser testada.

## Bloqueio atual

A conexão Supabase disponível lista somente o projeto `meucontrolefinanceiro`. O projeto de produção `llernwuqqcvxiazsdljl` responde **“You do not have permission to perform this action”**. Nenhuma mudança SQL foi executada.

O GitHub Pages existente ainda publica a versão antiga de `main` em `https://iranildofilho2021-collab.github.io/Lava-cash/`. Esta branch não altera essa publicação automaticamente.

## Concluir a migração

1. Conectar Supabase à conta/organização que possui `llernwuqqcvxiazsdljl`. Conferir logs, avisos, estrutura, políticas e índices com `scripts/diagnostico-supabase.sql` (somente leitura). Conferir `atualizado_em` e a unicidade de `(lavanderia_id, id_legado)` antes de validar o PATCH condicional.
2. Validar o login e as permissões de SELECT/INSERT/UPDATE/DELETE do proprietário e a negação a outra conta. Esta etapa usa **Firebase Auth**, como o site atual. A migração aqui trata da hospedagem; a remoção do provedor de login exige uma migração de identidade separada, preservando vínculos existentes.
3. Autorizar `iranildofilho2021-collab.github.io` no Firebase Authentication e conferir App Check, se estiver habilitado. Conferir a integração Firebase no Supabase e a claim `role: authenticated`. Nunca desativar RLS nem expor chave privilegiada para contornar um erro.
4. Exportar os dados locais e as pendências do domínio antigo em cada dispositivo. `localStorage` e IndexedDB pertencem à origem e **não migram automaticamente** para o domínio GitHub. Validar login, leitura, inclusão, edição, exclusão, concorrência e importação com dados de homologação.
5. Integrar a branch em `main`, selecionar **Settings > Pages > Source > GitHub Actions** e executar **Publicar LAVACASH no GitHub Pages**. O workflow aceita publicação somente a partir de `main`, executa os testes e envia `dist/`.
6. Confirmar o novo endereço e a sincronização entre aparelhos. Só então desativar **Firebase Hosting**, mantendo o projeto/Auth necessários ao login enquanto essa dependência existir. Não apagar o projeto Firebase como parte da troca de hospedagem.

## Limites conhecidos

- O esquema e as políticas reais do Supabase ainda não foram inspecionados. Os fluxos de investimentos, importação e séries não têm validação integrada e precisam de homologação; operações em múltiplos registros não são transações atômicas.
- Não executar duas importações/edições em paralelo antes de validar conflitos e o modelo de versões no servidor. A fila genérica de coleções legadas continua exigindo revisão para esse cenário.
- A política CSP de produção foi transportada para metatag. GitHub Pages não permite configurar cabeçalhos personalizados; `frame-ancestors` exige cabeçalho HTTP e não funciona em metatag. Os demais controles de login e autorização continuam necessários.
- Nenhum registro financeiro foi lido, criado, alterado ou excluído durante esta preparação.

Para reverter o código publicado, restaurar o commit anterior e publicar novamente. A troca de domínio não deve apagar o armazenamento local anterior.
