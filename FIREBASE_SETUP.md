# Guia de Configuração do Firebase

Este documento explica como configurar o Firebase Firestore para o projeto IRANCASH.

## O que foi implementado

1. **Módulo de configuração do Firebase** (`js/firebase/firebase-config.js`)
   - Contém as credenciais do seu projeto Firebase

2. **Firebase Store** (`js/firebase/firebase-store.js`)
   - Substitui IndexedDB/localStorage com sincronização na nuvem
   - Suporta persistência offline
   - Migração automática de dados locais

3. **Integração com DataStore**
   - `data-store.js` agora usa Firebase como prioridade
   - Fallback automático para IndexedDB/localStorage se Firebase não estiver disponível

4. **Inicialização automática** (`js/firebase-init.js`)
   - Carrega e inicializa Firebase em todas as páginas

## Configuração no Console do Firebase

### 1. Acesse o Console do Firebase

Acesse: https://console.firebase.google.com/

### 2. Selecione seu projeto

- Projeto: `teste2-341e6`

### 3. Configure o Firestore Database

1. No menu lateral, clique em **"Firestore Database"** (ou **"Banco de dados"**)
2. Clique em **"Criar banco de dados"** (se ainda não foi criado)
3. Escolha o modo:
   - **Recomendado**: Modo de produção (com regras de segurança)
   - **Para desenvolvimento**: Modo de teste (permite leitura/escrita por 30 dias)

### 4. Configure as Regras de Segurança (IMPORTANTE)

Clique na aba **"Regras"** e configure as regras de segurança:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Coleção 'data' - armazena todos os dados do aplicativo
    match /data/{document=**} {
      // Permite leitura e escrita para todos (ajuste conforme necessário)
      // IMPORTANTE: Para produção, implemente autenticação!
      allow read, write: if true;
      
      // Exemplo de regra com autenticação (recomendado para produção):
      // allow read, write: if request.auth != null;
    }
  }
}
```

**⚠️ ATENÇÃO**: A regra `allow read, write: if true;` permite acesso público. Para produção, implemente autenticação!

### 5. Configure índices (se necessário)

O Firestore criará índices automaticamente conforme necessário. Se aparecer avisos sobre índices compostos, clique no link fornecido para criá-los.

### 6. Estrutura de dados esperada

O sistema criará automaticamente uma coleção chamada **`data`** no Firestore, onde cada documento representa um item de dados:

```
data (coleção)
  ├── categorias (documento)
  │   └── value: ["Conta de Agua", "Energia", ...]
  ├── despesas (documento)
  │   └── value: [{ id: "...", ano: 2025, ... }, ...]
  ├── vendasResumo (documento)
  │   └── value: [...]
  └── vendasResumoDia (documento)
      └── value: [...]
```

Cada documento contém:
- `key`: Nome da chave (ex: "categorias", "despesas")
- `value`: Valor armazenado (pode ser array, objeto, string, etc.)
- `updatedAt`: Timestamp da última atualização
- `updatedBy`: ID do usuário que atualizou (ou "anonymous")

## Migração de dados

Na primeira execução, o sistema migrará automaticamente os dados do localStorage/IndexedDB para o Firebase. Você verá mensagens no console do navegador como:

```
[FirebaseStore] Iniciando migração do localStorage/IndexedDB para Firebase...
[FirebaseStore] Migrado: categorias
[FirebaseStore] Migrado: despesas
[FirebaseStore] Migração concluída: X itens migrados
```

## Testando a configuração

1. Abra o navegador e acesse qualquer página do site
2. Abra o Console do Desenvolvedor (F12)
3. Verifique se aparecem mensagens como:
   - `[FirebaseInit] Firebase SDK carregado`
   - `[FirebaseStore] Firebase inicializado com sucesso`
   - `[FirebaseStore] Migração concluída`

4. No Console do Firebase, verifique se os dados aparecem na coleção `data`

## Segurança (Recomendado para Produção)

### Implementar Autenticação

1. No Console do Firebase, vá em **"Authentication"**
2. Habilite um método de autenticação (Email/Password, Google, etc.)
3. Atualize as regras do Firestore para exigir autenticação:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /data/{document=**} {
      // Requer autenticação
      allow read, write: if request.auth != null;
      
      // Ou permitir apenas o próprio usuário:
      // allow read, write: if request.auth != null && 
      //   request.resource.data.updatedBy == request.auth.uid;
    }
  }
}
```

## Solução de Problemas

### Firebase não inicializa

- Verifique se as credenciais em `js/firebase/firebase-config.js` estão corretas
- Verifique o console do navegador para erros
- Certifique-se de que o Firestore está habilitado no projeto

### Dados não aparecem no Firebase

- Verifique as regras de segurança do Firestore
- Certifique-se de que a migração foi executada (verifique o console)
- Tente salvar um novo dado e verifique se aparece

### Erro de permissão

- Verifique as regras de segurança no Console do Firebase
- Certifique-se de que as regras permitem leitura/escrita

### Fallback para localStorage

Se o Firebase não estiver disponível, o sistema automaticamente usará IndexedDB/localStorage. Você verá mensagens como:

```
[FirebaseStore] Erro ao inicializar Firebase
[DataStore] Fallback para IndexedDB
```

## Suporte

Para mais informações sobre Firebase Firestore:
- Documentação: https://firebase.google.com/docs/firestore
- Console: https://console.firebase.google.com/
