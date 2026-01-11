# Documentacao Tecnica - Ajustes Dashboard e Usuarios (Jan 2026)

## Dashboard
- Substituido o grafico "Receita vs Despesas" por "Vendas por Periodo do Dia" no painel principal.
- Integrado seletor de mes no grafico de periodo; ao trocar o mes o dashboard e os cards ficam sincronizados.
- Otimizada a atualizacao dos cards de meses com debounce e atualizacao em frame unico para evitar duplicidade de acao.
- Ajustadas regras responsivas para reduzir padding lateral em telas menores e melhorar a largura util do conteudo.

## Persistencia de Usuarios
- AuthService passou a usar DataStore (Firebase > IndexedDB > localStorage) para ler/salvar usuarios.
- Login e cadastro agora aguardam o salvamento/leitura async e retornam erro caso o armazenamento falhe.
- Gestao de usuarios em configuracoes agora utiliza chamadas async com recarregamento seguro da tabela.
