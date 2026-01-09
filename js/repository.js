// Repository/DAO base para acesso a dados (CRUD)
// Permite futura troca de backend (IndexedDB, localStorage, Firebase, etc)

class BaseRepository {
  constructor(entityName, storage) {
    this.entityName = entityName;
    this.storage = storage; // Deve implementar métodos CRUD async
  }

  async create(item) {
    return this.storage.create(this.entityName, item);
  }

  async readAll() {
    return this.storage.readAll(this.entityName);
  }

  async readById(id) {
    return this.storage.readById(this.entityName, id);
  }

  async update(id, updates) {
    return this.storage.update(this.entityName, id, updates);
  }

  async delete(id) {
    return this.storage.delete(this.entityName, id);
  }
}

export default BaseRepository;
