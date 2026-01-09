// Definição de schemas e validação para entidades
// Facilita migração e garante integridade dos dados

export const Schemas = {
  categoria: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      nome: { type: 'string', maxLength: 50 },
      criadoEm: { type: 'string', format: 'date-time' },
      atualizadoEm: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'nome', 'criadoEm', 'atualizadoEm']
  },
  despesa: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      ano: { type: 'number' },
      mes: { type: 'number' },
      categoria: { type: 'string' },
      valor: { type: 'number', minimum: 0 },
      descricao: { type: 'string', maxLength: 100 },
      criadoEm: { type: 'string', format: 'date-time' },
      atualizadoEm: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'ano', 'mes', 'categoria', 'valor', 'criadoEm', 'atualizadoEm']
  }
};

// Validação simples baseada no schema
export function validate(entity, schema) {
  if (typeof entity !== 'object' || !entity) return false;
  for (const key of schema.required) {
    if (!(key in entity)) return false;
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.type && typeof entity[key] !== prop.type) return false;
    if (prop.maxLength && typeof entity[key] === 'string' && entity[key].length > prop.maxLength) return false;
    if (prop.minimum !== undefined && typeof entity[key] === 'number' && entity[key] < prop.minimum) return false;
  }
  return true;
}
