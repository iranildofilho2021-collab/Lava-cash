/**
 * Lógica da Página de Cadastro
 */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const btnSignup = document.getElementById('btn-signup');
    const spinner = document.getElementById('spinner');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Gather data
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            const role = document.getElementById('role').value;
            
            // Basic validation
            if (!name || !email || !password || !role) {
                alert('Todos os campos são obrigatórios.');
                return;
            }
            
            setLoading(true);
            
            try {
                // Simular delay
                await new Promise(r => setTimeout(r, 1000));
                
                if (typeof AuthService !== 'undefined') {
                    const result = AuthService.register({
                        name,
                        email,
                        password,
                        role
                    });
                    
                    if (result.success) {
                        alert('Conta criada com sucesso! Faça login para continuar.');
                        window.location.href = 'login.html';
                    } else {
                        alert(result.message || 'Erro ao criar conta.');
                        setLoading(false);
                    }
                } else {
                    alert('Erro interno: AuthService não carregado.');
                    setLoading(false);
                }
            } catch (error) {
                console.error(error);
                alert('Erro inesperado.');
                setLoading(false);
            }
        });
    }
    
    function setLoading(isLoading) {
        if (isLoading) {
            btnSignup.disabled = true;
            btnSignup.querySelector('span').textContent = 'Criando conta...';
            spinner.classList.remove('hidden');
        } else {
            btnSignup.disabled = false;
            btnSignup.querySelector('span').textContent = 'Criar Conta';
            spinner.classList.add('hidden');
        }
    }
});
