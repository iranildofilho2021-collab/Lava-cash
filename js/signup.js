/**
 * Logica da Pagina de Cadastro
 */
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('signup-form');
    const btnSignup = document.getElementById('btn-signup');
    const spinner = document.getElementById('spinner');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value.trim();
        const role = document.getElementById('role').value;
        if (!name || !email || !password || !role) {
            alert('Todos os campos sao obrigatorios.');
            return;
        }
        setLoading(true);
        try {
            await new Promise(r => setTimeout(r, 1000));
            if (typeof AuthService !== 'undefined') {
                const result = await AuthService.register({
                    name,
                    email,
                    password,
                    role
                });
                if (result.success) {
                    alert('Conta criada com sucesso! Faca login para continuar.');
                    window.location.href = 'index.html';
                } else {
                    alert(result.message || 'Erro ao criar conta.');
                    setLoading(false);
                }
            } else {
                alert('Erro interno: AuthService nao carregado.');
                setLoading(false);
            }
        } catch (error) {
            console.error(error);
            alert('Erro inesperado.');
            setLoading(false);
        }
    });
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