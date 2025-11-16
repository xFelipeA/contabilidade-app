class ContabilidadeApp {
    constructor() {
        this.apiBase = 'https://contabilidade-app-cgxt.onrender.com';
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user') || '{}');
        this.currentSheetId = null;
        this.init();
    }

    init() {
        this.checkAuth();
        this.setupEventListeners();
        if (this.token) {
            this.loadDashboard();
        }
    }

    checkAuth() {
        if (this.token && this.user.id) {
            this.showMainScreen();
        } else {
            this.showLoginScreen();
        }
    }

    showLoginScreen() {
        document.getElementById('login-screen').classList.add('active');
        document.getElementById('main-screen').classList.remove('active');
    }

    showMainScreen() {
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
        document.getElementById('user-info').textContent = `${this.user.username} (${this.user.role})`;
        
        // Mostrar menu admin apenas para admin/gerente
        if (['admin', 'gerente'].includes(this.user.role)) {
            document.getElementById('admin-menu').style.display = 'block';
        }
    }

    setupEventListeners() {
        // Login
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Navegação
        document.querySelectorAll('.sidebar a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.showSection(link.getAttribute('data-section'));
            });
        });

        // Clientes
        document.getElementById('add-client-btn').addEventListener('click', () => this.showClientModal());
        document.getElementById('client-form').addEventListener('submit', (e) => this.saveClient(e));

        // Planilha
        document.getElementById('new-sheet-btn').addEventListener('click', () => this.newSpreadsheet());
        document.getElementById('save-sheet-btn').addEventListener('click', () => this.saveSpreadsheet());

        // Documentos
        document.getElementById('upload-document-btn').addEventListener('click', () => this.uploadDocument());

        // Boletos
        document.getElementById('new-payment-btn').addEventListener('click', () => this.showPaymentModal());
        document.getElementById('payment-form').addEventListener('submit', (e) => this.createPayment(e));

        // Usuários
        document.getElementById('add-user-btn').addEventListener('click', () => this.showUserModal());
        document.getElementById('user-form').addEventListener('submit', (e) => this.saveUser(e));
    }

    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch(`${this.apiBase}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.access_token;
                this.user = data.user;
                localStorage.setItem('token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                this.showMainScreen();
                this.loadDashboard();
                this.showMessage('Login realizado com sucesso!', 'success');
            } else {
                this.showMessage(data.message, 'error', 'login-message');
            }
        } catch (error) {
            this.showMessage('Erro ao fazer login', 'error', 'login-message');
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        this.token = null;
        this.user = {};
        this.showLoginScreen();
    }

    showSection(sectionName) {
        // Atualizar menu ativo
        document.querySelectorAll('.sidebar a').forEach(link => link.classList.remove('active'));
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Mostrar seção
        document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
        document.getElementById(sectionName).classList.add('active');

        // Carregar dados da seção
        switch(sectionName) {
            case 'clients':
                this.loadClients();
                break;
            case 'spreadsheet':
                this.loadSpreadsheets();
                break;
            case 'documents':
                this.loadClientsForDocuments();
                break;
            case 'payments':
                this.loadPayments();
                break;
            case 'users':
                this.loadUsers();
                break;
        }
    }

    async apiCall(endpoint, options = {}) {
        const config = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        const response = await fetch(`${this.apiBase}${endpoint}`, config);
        
        if (response.status === 401) {
            this.logout();
            throw new Error('Sessão expirada');
        }

        return response;
    }

    showMessage(message, type, elementId = null) {
        const messageEl = elementId ? document.getElementById(elementId) : this.createTempMessage();
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';

        if (!elementId) {
            setTimeout(() => messageEl.remove(), 3000);
        }
    }

    createTempMessage() {
        const messageEl = document.createElement('div');
        messageEl.style.position = 'fixed';
        messageEl.style.top = '20px';
        messageEl.style.right = '20px';
        messageEl.style.zIndex = '1000';
        document.body.appendChild(messageEl);
        return messageEl;
    }

    // Clientes
    async loadClients() {
        try {
            const response = await this.apiCall('/clients');
            const clients = await response.json();
            
            const tbody = document.getElementById('clients-tbody');
            tbody.innerHTML = clients.map(client => `
                <tr>
                    <td>${client.name}</td>
                    <td>${client.email}</td>
                    <td>${client.phone || '-'}</td>
                    <td>${client.document}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="app.editClient(${client.id})">Editar</button>
                        ${['admin', 'gerente'].includes(this.user.role) ? 
                          `<button class="btn btn-danger" onclick="app.deleteClient(${client.id})">Excluir</button>` : ''}
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            this.showMessage('Erro ao carregar clientes', 'error');
        }
    }

    showClientModal(client = null) {
        const modal = document.getElementById('client-modal');
        const title = document.getElementById('client-modal-title');
        const form = document.getElementById('client-form');
        
        if (client) {
            title.textContent = 'Editar Cliente';
            document.getElementById('client-id').value = client.id;
            document.getElementById('client-name').value = client.name;
            document.getElementById('client-email').value = client.email;
            document.getElementById('client-phone').value = client.phone || '';
            document.getElementById('client-document').value = client.document;
            document.getElementById('client-address').value = client.address || '';
        } else {
            title.textContent = 'Novo Cliente';
            form.reset();
        }
        
        modal.style.display = 'block';
    }

    async saveClient(e) {
        e.preventDefault();
        
        const clientData = {
            name: document.getElementById('client-name').value,
            email: document.getElementById('client-email').value,
            phone: document.getElementById('client-phone').value,
            document: document.getElementById('client-document').value,
            address: document.getElementById('client-address').value
        };

        const clientId = document.getElementById('client-id').value;

        try {
            const url = clientId ? `/clients/${clientId}` : '/clients';
            const method = clientId ? 'PUT' : 'POST';

            const response = await this.apiCall(url, {
                method,
                body: JSON.stringify(clientData)
            });

            if (response.ok) {
                this.showMessage('Cliente salvo com sucesso!', 'success');
                closeModal('client-modal');
                this.loadClients();
            }
        } catch (error) {
            this.showMessage('Erro ao salvar cliente', 'error');
        }
    }

    async editClient(clientId) {
        try {
            const response = await this.apiCall(`/clients/${clientId}`);
            const client = await response.json();
            this.showClientModal(client);
        } catch (error) {
            this.showMessage('Erro ao carregar cliente', 'error');
        }
    }

    async deleteClient(clientId) {
        if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

        try {
            const response = await this.apiCall(`/clients/${clientId}`, { method: 'DELETE' });
            
            if (response.ok) {
                this.showMessage('Cliente excluído com sucesso!', 'success');
                this.loadClients();
            }
        } catch (error) {
            this.showMessage('Erro ao excluir cliente', 'error');
        }
    }

    // Planilha
    async loadSpreadsheets() {
        try {
            const response = await this.apiCall('/spreadsheets');
            const spreadsheets = await response.json();
            
            // Por simplicidade, carregamos a primeira planilha
            if (spreadsheets.length > 0) {
                this.loadSpreadsheetData(spreadsheets[0]);
            } else {
                this.newSpreadsheet();
            }
        } catch (error) {
            this.showMessage('Erro ao carregar planilhas', 'error');
        }
    }

    newSpreadsheet() {
        this.currentSheetId = null;
        document.getElementById('sheet-name').value = 'Nova Planilha';
        this.createSpreadsheetGrid([[]]);
    }

    createSpreadsheetGrid(data) {
        const grid = document.getElementById('spreadsheet-grid');
        const table = document.createElement('table');
        table.className = 'spreadsheet-table';
        
        // Cabeçalho com letras das colunas
        let headerHtml = '<tr><th></th>';
        const cols = data[0] ? data[0].length : 10;
        for (let i = 0; i < cols; i++) {
            headerHtml += `<th>${String.fromCharCode(65 + i)}</th>`;
        }
        headerHtml += '</tr>';
        
        // Linhas com números e células
        let rowsHtml = '';
        for (let i = 0; i < (data.length || 50); i++) {
            rowsHtml += `<tr><th>${i + 1}</th>`;
            for (let j = 0; j < cols; j++) {
                const value = data[i] && data[i][j] ? data[i][j] : '';
                rowsHtml += `<td contenteditable="true" data-row="${i}" data-col="${j}">${value}</td>`;
            }
            rowsHtml += '</tr>';
        }
        
        table.innerHTML = headerHtml + rowsHtml;
        grid.innerHTML = '';
        grid.appendChild(table);
    }

    getSpreadsheetData() {
        const data = [];
        const cells = document.querySelectorAll('#spreadsheet-grid td[contenteditable="true"]');
        
        cells.forEach(cell => {
            const row = parseInt(cell.getAttribute('data-row'));
            const col = parseInt(cell.getAttribute('data-col'));
            
            if (!data[row]) data[row] = [];
            data[row][col] = cell.textContent;
        });
        
        return data;
    }

    async saveSpreadsheet() {
        const name = document.getElementById('sheet-name').value;
        const data = this.getSpreadsheetData();

        try {
            const url = this.currentSheetId ? `/spreadsheets/${this.currentSheetId}` : '/spreadsheets';
            const method = this.currentSheetId ? 'PUT' : 'POST';

            const response = await this.apiCall(url, {
                method,
                body: JSON.stringify({ name, data })
            });

            if (response.ok) {
                this.showMessage('Planilha salva com sucesso!', 'success');
                if (!this.currentSheetId) {
                    const result = await response.json();
                    this.currentSheetId = result.id;
                }
            }
        } catch (error) {
            this.showMessage('Erro ao salvar planilha', 'error');
        }
    }

    loadSpreadsheetData(spreadsheet) {
        this.currentSheetId = spreadsheet.id;
        document.getElementById('sheet-name').value = spreadsheet.name;
        this.createSpreadsheetGrid(spreadsheet.data);
    }

    // Documentos
    async loadClientsForDocuments() {
        try {
            const response = await this.apiCall('/clients');
            const clients = await response.json();
            
            const select = document.getElementById('document-client-select');
            select.innerHTML = '<option value="">Selecione um cliente</option>' +
                clients.map(client => `<option value="${client.id}">${client.name}</option>`).join('');
        } catch (error) {
            this.showMessage('Erro ao carregar clientes', 'error');
        }
    }

    async uploadDocument() {
        const clientId = document.getElementById('document-client-select').value;
        const description = document.getElementById('document-description').value;
        const fileInput = document.getElementById('document-file');
        const file = fileInput.files[0];

        if (!clientId || !file) {
            this.showMessage('Selecione um cliente e um arquivo', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('client_id', clientId);
        formData.append('description', description);

        try {
            const response = await fetch(`${this.apiBase}/documents`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            if (response.ok) {
                this.showMessage('Documento enviado com sucesso!', 'success');
                fileInput.value = '';
                document.getElementById('document-description').value = '';
            }
        } catch (error) {
            this.showMessage('Erro ao enviar documento', 'error');
        }
    }

    // Boletos
    async loadPayments() {
        try {
            // Carregar clientes para o modal
            const clientsResponse = await this.apiCall('/clients');
            const clients = await clientsResponse.json();
            
            const select = document.getElementById('payment-client');
            select.innerHTML = '<option value="">Selecione um cliente</option>' +
                clients.map(client => `<option value="${client.id}">${client.name}</option>`).join('');

            // Carregar pagamentos
            const paymentsList = document.getElementById('payments-list');
            paymentsList.innerHTML = '<p>Carregando...</p>';

            // Por simplicidade, mostramos todos os pagamentos
            // Em produção, você pode querer filtrar por cliente
            let allPayments = [];
            for (const client of clients) {
                const paymentsResponse = await this.apiCall(`/clients/${client.id}/payments`);
                const payments = await paymentsResponse.json();
                allPayments = allPayments.concat(payments.map(p => ({...p, client_name: client.name})));
            }

            paymentsList.innerHTML = allPayments.map(payment => `
                <div class="payment-item">
                    <div class="payment-info">
                        <h4>${payment.client_name}</h4>
                        <p>${payment.description || 'Pagamento'}</p>
                        <p>Vencimento: ${new Date(payment.due_date).toLocaleDateString()}</p>
                        <p class="payment-amount">R$ ${payment.amount}</p>
                    </div>
                    <div>
                        <button class="btn btn-primary" onclick="app.downloadBillet(${payment.id})">
                            <i class="fas fa-download"></i> Baixar Boleto
                        </button>
                    </div>
                </div>
            `).join('') || '<p>Nenhum boleto encontrado</p>';

        } catch (error) {
            this.showMessage('Erro ao carregar boletos', 'error');
        }
    }

    showPaymentModal() {
        document.getElementById('payment-modal').style.display = 'block';
    }

    async createPayment(e) {
        e.preventDefault();
        
        const paymentData = {
            client_id: document.getElementById('payment-client').value,
            amount: parseFloat(document.getElementById('payment-amount').value),
            due_date: document.getElementById('payment-due-date').value,
            description: document.getElementById('payment-description').value
        };

        try {
            const response = await this.apiCall('/payments', {
                method: 'POST',
                body: JSON.stringify(paymentData)
            });

            if (response.ok) {
                this.showMessage('Boleto criado com sucesso!', 'success');
                closeModal('payment-modal');
                this.loadPayments();
            }
        } catch (error) {
            this.showMessage('Erro ao criar boleto', 'error');
        }
    }

    async downloadBillet(paymentId) {
        window.open(`${this.apiBase}/payments/${paymentId}/billet`, '_blank');
    }

    // Usuários
    async loadUsers() {
        if (!['admin', 'gerente'].includes(this.user.role)) return;

        try {
            // Em produção, você teria uma rota específica para usuários
            // Por enquanto, vamos simular carregando apenas o usuário atual
            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = `
                <tr>
                    <td>${this.user.username}</td>
                    <td>${this.user.email}</td>
                    <td>${this.user.role}</td>
                    <td>-</td>
                </tr>
            `;
        } catch (error) {
            this.showMessage('Erro ao carregar usuários', 'error');
        }
    }

    showUserModal() {
        document.getElementById('user-modal').style.display = 'block';
    }

    async saveUser(e) {
        e.preventDefault();
        
        const userData = {
            username: document.getElementById('user-username').value,
            email: document.getElementById('user-email').value,
            password: document.getElementById('user-password').value,
            role: document.getElementById('user-role').value
        };

        try {
            const response = await this.apiCall('/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });

            if (response.ok) {
                this.showMessage('Usuário criado com sucesso!', 'success');
                closeModal('user-modal');
                this.loadUsers();
            }
        } catch (error) {
            this.showMessage('Erro ao criar usuário', 'error');
        }
    }

    // Dashboard
    async loadDashboard() {
        try {
            const clientsResponse = await this.apiCall('/clients');
            const clients = await clientsResponse.json();
            
            document.getElementById('total-clients').textContent = clients.length;
            // Em produção, você carregaria os outros dados também
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        }
    }
}

// Funções globais para modais
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// Inicializar app
const app = new ContabilidadeApp();
