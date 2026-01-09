// Logger simples para operações de dados
// Permite rastrear erros e ações importantes

class Logger {
  static info(msg, ...args) {
    console.info(`[INFO] ${new Date().toISOString()} - ${msg}`, ...args);
  }
  static warn(msg, ...args) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, ...args);
  }
  static error(msg, ...args) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, ...args);
  }
}

export default Logger;
