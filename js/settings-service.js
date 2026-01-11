/**
 * Serviço para gerenciar configurações globais do sistema
 * (Nome do App, Sócios, Percentuais)
 */
(function(global) {
    'use strict';

    const SETTINGS_KEY = 'global_settings';
    
    // Default Settings
    const DEFAULTS = {
        appName: 'LavaJá Lavanderia',
        partners: [
            { name: 'Iranildo Filho', role: 'Sócio', share: 34, investment: 14 },
            { name: 'Elder de Medeiros', role: 'Sócio', share: 33, investment: 43 },
            { name: 'Leonardo Hermes', role: 'Sócio', share: 33, investment: 43 }
        ]
    };

    const SettingsService = {
        
        async getSettings() {
            if (global.IRANCASH && global.IRANCASH.DataStore) {
                const data = await global.IRANCASH.DataStore.getItemAsync(SETTINGS_KEY);
                if (data) return { ...DEFAULTS, ...data }; // Merge with defaults to ensure structure
            }
            return DEFAULTS;
        },

        async saveSettings(settings) {
            if (global.IRANCASH && global.IRANCASH.DataStore) {
                const current = await this.getSettings();
                const toSave = { ...current, ...settings };
                await global.IRANCASH.DataStore.setItemAsync(SETTINGS_KEY, toSave);
                
                // Dispatch event for live updates
                window.dispatchEvent(new CustomEvent('irancash:settings:updated', { detail: toSave }));
                return true;
            }
            return false;
        },

        // Helper to get App Name synchronously (from cache/localStorage if possible)
        getAppNameSync() {
            try {
                const raw = localStorage.getItem(SETTINGS_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    return data.appName || DEFAULTS.appName;
                }
            } catch(e) {}
            return DEFAULTS.appName;
        }
    };

    global.SettingsService = SettingsService;

})(window);
