// Storage isolado para CRUD genérico (IndexedDB/localStorage)
// Implementa interface esperada pelo BaseRepository

class LocalStorageAdapter {
  constructor() {}

  async create(entity, item) {
    const all = await this.readAll(entity);
    item.id = item.id || Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
    all.push(item);
    localStorage.setItem(entity, JSON.stringify(all));
    return item;
  }

  async readAll(entity) {
    try {
      const raw = localStorage.getItem(entity);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async readById(entity, id) {
    const all = await this.readAll(entity);
    return all.find(item => item.id === id) || null;
  }

  async update(entity, id, updates) {
    const all = await this.readAll(entity);
    const idx = all.findIndex(item => item.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates };
    localStorage.setItem(entity, JSON.stringify(all));
    return all[idx];
  }

  async delete(entity, id) {
    const all = await this.readAll(entity);
    const filtered = all.filter(item => item.id !== id);
    localStorage.setItem(entity, JSON.stringify(filtered));
    return true;
  }
}

export default LocalStorageAdapter;
