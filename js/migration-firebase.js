// Módulo de migração para Firebase
// Converte dados locais para formato compatível com Firebase
// Exemplo: exportação de despesas e categorias

import { Schemas, validate } from './schema.js';

export async function exportToFirebaseFormat(repository, entityType) {
  const all = await repository.readAll();
  const schema = Schemas[entityType];
  // Filtra e valida os dados
  const valid = all.filter(item => validate(item, schema));
  // Adiciona metadados para Firebase
  return valid.map(item => ({
    ...item,
    firebaseId: item.id,
    migratedAt: new Date().toISOString()
  }));
}

// Exemplo de uso:
// const categoriasFirebase = await exportToFirebaseFormat(categoriasRepo, 'categoria');
// const despesasFirebase = await exportToFirebaseFormat(despesasRepo, 'despesa');
