# Lava-Cash 💰

Sistema de gerenciamento financeiro com interface web moderna e validação de código automatizada.

## 📋 Sobre o Projeto

Este é um protótipo de site estático para gerenciamento financeiro. O site funciona diretamente no navegador sem necessidade de backend, utilizando Tailwind CSS via CDN para estilização e armazenamento local para persistência de dados.

## 🚀 Como Usar

1. Abra o arquivo `index.html` no navegador (duplo clique ou arraste para o navegador).
2. O site funciona sem Node/npm; Tailwind é carregado via CDN para prototipagem rápida.

## 🛠️ Estrutura do Projeto

```
Lava-cash/
├── assets/          # Imagens e recursos estáticos
├── css/             # Arquivos de estilo CSS
├── js/              # Scripts JavaScript
├── .github/         # Configurações do GitHub Actions
│   └── workflows/   # Workflows de CI/CD
├── *.html           # Páginas HTML do projeto
└── package.json     # Dependências e scripts npm
```

## ✅ Validação de Código (Linters)

Este projeto utiliza linters para garantir a qualidade e padrões do código:

- **HTMLHint**: Valida a estrutura e padrões do HTML
- **Stylelint**: Verifica boas práticas no CSS
- **ESLint**: Valida o JavaScript seguindo as melhores práticas

### Executar Linters Localmente

Primeiro, instale as dependências:

```bash
npm install
```

Executar todos os linters:

```bash
npm run lint
```

Executar linters individualmente:

```bash
npm run lint:html    # Validar HTML
npm run lint:css     # Validar CSS
npm run lint:js      # Validar JavaScript
```

Corrigir problemas automaticamente (quando possível):

```bash
npm run lint:fix
```

## 🔄 CI/CD Pipeline

O projeto possui um pipeline automatizado no GitHub Actions que:

- Executa automaticamente em cada commit ou pull request
- Valida todo o código com os linters configurados
- Garante que apenas código limpo seja integrado ao projeto

O workflow pode ser encontrado em `.github/workflows/lint.yml`.

### Status do Pipeline

O pipeline é executado automaticamente nas branches:
- `main`
- `develop`
- `feature/**`
- `copilot/**`

## 📝 Observações

- Este é um protótipo estático. Para adicionar processamento real (CSV parsing, armazenamento no servidor), será necessário um backend ou uma versão com Node e bibliotecas adicionais.
- O projeto pode ser facilmente hospedado em plataformas como Netlify ou Vercel.

## 🤝 Contribuindo

1. Certifique-se de que o código passa em todos os linters antes de fazer commit
2. Execute `npm run lint` para validar suas alterações
3. O pipeline de CI/CD validará automaticamente seu código no GitHub

## 📄 Licença

Este projeto é privado e de uso interno.

