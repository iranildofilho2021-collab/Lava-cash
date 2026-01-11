/**
 * Serviço de Autenticação e Autorização
 * Gerencia usuários, sessões e permissões (Simulando Backend)
 * @module AuthService
 */
(function(global) {
    'use strict';

    const USERS_DB_KEY = 'irancash_users_db';
    const SESSION_KEY = 'irancash_session';
    
    // Hardcoded Developer Credentials
    const DEV_CREDENTIALS = {
        login: 'Teste',
        password: 'Teste1',
        name: 'Desenvolvedor Master',
        role: 'developer',
        email: 'dev@irancash.com'
    };

    // Definição de Permissões por Role
    const ROLES = {
        developer: {
            name: 'Desenvolvedor',
            permissions: ['*'] // Acesso total
        },
        cadastrador: {
            name: 'Cadastrador',
            permissions: ['read', 'create', 'update', 'delete'] // Sem acesso a 'config'
        },
        visualizador: {
            name: 'Visualizador',
            permissions: ['read'] // Apenas leitura
        }
    };

    // ========== DATABASE SIMULATION ==========

    function getUsersDB() {
        const raw = localStorage.getItem(USERS_DB_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    function saveUsersDB(users) {
        localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
    }

    function findUser(emailOrLogin) {
        // Check Hardcoded Dev first
        if (emailOrLogin === DEV_CREDENTIALS.login || emailOrLogin === DEV_CREDENTIALS.email) {
            return DEV_CREDENTIALS;
        }
        
        const users = getUsersDB();
        return users.find(u => u.email === emailOrLogin);
    }

    // ========== AUTHENTICATION ==========

    function login(emailOrLogin, password) {
        // 1. Check Developer (Always Active)
        if (emailOrLogin === DEV_CREDENTIALS.login || emailOrLogin === DEV_CREDENTIALS.email) {
             if (password === DEV_CREDENTIALS.password) {
                const session = { ...DEV_CREDENTIALS, loginTime: Date.now() };
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
                return { success: true, user: session };
             } else {
                 return { success: false, message: 'Credenciais inválidas.' };
             }
        }

        // 2. Check Database Users
        const user = findUser(emailOrLogin);
        if (user && user.password === password) { 
            // Check Approval (Agora é opcional, mas se o admin bloquear, deve respeitar)
            if (user.active === false) { // Se for explicitamente false (bloqueado)
                return { success: false, message: 'Sua conta está inativa. Contate o administrador.' };
            }

            const session = { 
                name: user.name,
                email: user.email,
                role: user.role,
                loginTime: Date.now() 
            };
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            return { success: true, user: session };
        }

        return { success: false, message: 'Credenciais inválidas.' };
    }

    function logout() {
        localStorage.removeItem(SESSION_KEY);
        window.location.href = 'login.html';
    }

    function register(userData) {
        const users = getUsersDB();
        
        // Check duplicatas
        if (users.some(u => u.email === userData.email)) {
            return { success: false, message: 'E-mail já cadastrado.' };
        }

        // Validação básica
        if (!userData.name || !userData.email || !userData.password) {
            return { success: false, message: 'Todos os campos são obrigatórios.' };
        }

        const newUser = {
            id: Date.now().toString(36),
            name: userData.name,
            email: userData.email,
            password: userData.password, 
            role: userData.role || 'visualizador', // Default para visualizador
            active: true, // Auto-aprovado conforme solicitado
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsersDB(users);

        return { success: true, user: newUser, message: 'Cadastro realizado com sucesso!' };
    }

    // ========== USER MANAGEMENT (DEV ONLY) ==========

    function getAllUsers() {
        return getUsersDB().map(u => ({...u, password: '***'})); // Hide passwords
    }

    function toggleUserStatus(email) {
        const users = getUsersDB();
        const user = users.find(u => u.email === email);
        if (user) {
            user.active = !user.active;
            saveUsersDB(users);
            return true;
        }
        return false;
    }
    
    function deleteUser(email) {
        let users = getUsersDB();
        const initialLen = users.length;
        users = users.filter(u => u.email !== email);
        if (users.length !== initialLen) {
            saveUsersDB(users);
            return true;
        }
        return false;
    }

    function updateUserRole(email, newRole) {
        const users = getUsersDB();
        const user = users.find(u => u.email === email);
        if (user && ROLES[newRole]) {
            user.role = newRole;
            saveUsersDB(users);
            return true;
        }
        return false;
    }

    function getCurrentUser() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    }

    function isAuthenticated() {
        return !!getCurrentUser();
    }

    // ========== AUTHORIZATION ==========

    function hasPermission(permission) {
        const user = getCurrentUser();
        if (!user) return false;

        const roleConfig = ROLES[user.role];
        if (!roleConfig) return false;

        if (roleConfig.permissions.includes('*')) return true;
        return roleConfig.permissions.includes(permission);
    }

    function canAccessPage(pageName) {
        const user = getCurrentUser();
        if (!user) return false;

        // Configurações: Apenas Developer
        if (pageName.includes('configuracoes') || pageName.includes('Configurações')) {
            return user.role === 'developer';
        }

        return true;
    }

    // Export
    global.AuthService = {
        login,
        logout,
        register,
        getCurrentUser,
        isAuthenticated,
        hasPermission,
        canAccessPage,
        // User Management
        getAllUsers,
        toggleUserStatus,
        deleteUser,
        updateUserRole,
        ROLES
    };

})(window);
