from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from models import db, User, Client, Spreadsheet, Document, Payment
import bcrypt
import os
from datetime import datetime, timedelta
import json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from io import BytesIO

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET', 'segredo-super-secreto')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)

db.init_app(app)
jwt = JWTManager(app)
CORS(app)

# Inicializar banco de dados
with app.app_context():
    db.create_all()
    # Criar usuário admin padrão se não existir
    if not User.query.filter_by(username='admin').first():
        hashed_password = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt())
        admin_user = User(
            username='admin',
            password=hashed_password.decode('utf-8'),
            role='admin',
            email='admin@contabilidade.com'
        )
        db.session.add(admin_user)
        db.session.commit()

# Rotas de Autenticação
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(username=data.get('username')).first()
    
    if user and bcrypt.checkpw(data.get('password').encode('utf-8'), user.password.encode('utf-8')):
        access_token = create_access_token(identity={
            'id': user.id,
            'username': user.username,
            'role': user.role
        })
        return jsonify({
            'access_token': access_token,
            'user': {
                'id': user.id,
                'username': user.username,
                'role': user.role,
                'email': user.email
            }
        }), 200
    
    return jsonify({'message': 'Credenciais inválidas'}), 401

@app.route('/api/register', methods=['POST'])
@jwt_required()
def register():
    current_user = get_jwt_identity()
    if current_user['role'] not in ['admin', 'gerente']:
        return jsonify({'message': 'Permissão negada'}), 403
    
    data = request.get_json()
    hashed_password = bcrypt.hashpw(data.get('password').encode('utf-8'), bcrypt.gensalt())
    
    user = User(
        username=data.get('username'),
        password=hashed_password.decode('utf-8'),
        role=data.get('role', 'funcionario'),
        email=data.get('email')
    )
    
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'Usuário criado com sucesso'}), 201

# Rotas de Clientes
@app.route('/api/clients', methods=['GET'])
@jwt_required()
def get_clients():
    clients = Client.query.all()
    return jsonify([{
        'id': client.id,
        'name': client.name,
        'email': client.email,
        'phone': client.phone,
        'document': client.document,
        'address': client.address,
        'created_at': client.created_at.isoformat()
    } for client in clients])

@app.route('/api/clients', methods=['POST'])
@jwt_required()
def create_client():
    data = request.get_json()
    client = Client(
        name=data.get('name'),
        email=data.get('email'),
        phone=data.get('phone'),
        document=data.get('document'),
        address=data.get('address')
    )
    db.session.add(client)
    db.session.commit()
    return jsonify({'message': 'Cliente criado com sucesso', 'id': client.id}), 201

@app.route('/api/clients/<int:client_id>', methods=['PUT'])
@jwt_required()
def update_client(client_id):
    client = Client.query.get_or_404(client_id)
    data = request.get_json()
    
    client.name = data.get('name', client.name)
    client.email = data.get('email', client.email)
    client.phone = data.get('phone', client.phone)
    client.document = data.get('document', client.document)
    client.address = data.get('address', client.address)
    
    db.session.commit()
    return jsonify({'message': 'Cliente atualizado com sucesso'})

@app.route('/api/clients/<int:client_id>', methods=['DELETE'])
@jwt_required()
def delete_client(client_id):
    current_user = get_jwt_identity()
    if current_user['role'] not in ['admin', 'gerente']:
        return jsonify({'message': 'Permissão negada'}), 403
    
    client = Client.query.get_or_404(client_id)
    db.session.delete(client)
    db.session.commit()
    return jsonify({'message': 'Cliente deletado com sucesso'})

# Rotas de Planilha
@app.route('/api/spreadsheets', methods=['GET'])
@jwt_required()
def get_spreadsheets():
    spreadsheets = Spreadsheet.query.all()
    return jsonify([{
        'id': sheet.id,
        'name': sheet.name,
        'data': json.loads(sheet.data),
        'created_by': sheet.created_by,
        'created_at': sheet.created_at.isoformat(),
        'updated_at': sheet.updated_at.isoformat()
    } for sheet in spreadsheets])

@app.route('/api/spreadsheets', methods=['POST'])
@jwt_required()
def create_spreadsheet():
    data = request.get_json()
    current_user = get_jwt_identity()
    
    spreadsheet = Spreadsheet(
        name=data.get('name'),
        data=json.dumps(data.get('data', [])),
        created_by=current_user['id']
    )
    db.session.add(spreadsheet)
    db.session.commit()
    return jsonify({'message': 'Planilha criada com sucesso', 'id': spreadsheet.id}), 201

@app.route('/api/spreadsheets/<int:sheet_id>', methods=['PUT'])
@jwt_required()
def update_spreadsheet(sheet_id):
    spreadsheet = Spreadsheet.query.get_or_404(sheet_id)
    data = request.get_json()
    
    spreadsheet.name = data.get('name', spreadsheet.name)
    spreadsheet.data = json.dumps(data.get('data', []))
    spreadsheet.updated_at = datetime.utcnow()
    
    db.session.commit()
    return jsonify({'message': 'Planilha atualizada com sucesso'})

# Rotas de Documentos
@app.route('/api/documents', methods=['POST'])
@jwt_required()
def upload_document():
    if 'file' not in request.files:
        return jsonify({'message': 'Nenhum arquivo enviado'}), 400
    
    file = request.files['file']
    client_id = request.form.get('client_id')
    description = request.form.get('description', '')
    
    if file.filename == '':
        return jsonify({'message': 'Nome de arquivo vazio'}), 400
    
    document = Document(
        filename=file.filename,
        file_data=file.read(),
        client_id=client_id,
        description=description,
        uploaded_by=get_jwt_identity()['id']
    )
    
    db.session.add(document)
    db.session.commit()
    
    return jsonify({'message': 'Documento enviado com sucesso', 'id': document.id}), 201

@app.route('/api/documents/<int:document_id>', methods=['GET'])
@jwt_required()
def download_document(document_id):
    document = Document.query.get_or_404(document_id)
    return send_file(
        BytesIO(document.file_data),
        download_name=document.filename,
        as_attachment=True
    )

@app.route('/api/clients/<int:client_id>/documents', methods=['GET'])
@jwt_required()
def get_client_documents(client_id):
    documents = Document.query.filter_by(client_id=client_id).all()
    return jsonify([{
        'id': doc.id,
        'filename': doc.filename,
        'description': doc.description,
        'uploaded_at': doc.uploaded_at.isoformat(),
        'uploaded_by': doc.uploaded_by
    } for doc in documents])

# Rotas de Pagamentos/Boleto
@app.route('/api/payments', methods=['POST'])
@jwt_required()
def create_payment():
    data = request.get_json()
    current_user = get_jwt_identity()
    
    payment = Payment(
        client_id=data.get('client_id'),
        amount=data.get('amount'),
        due_date=datetime.strptime(data.get('due_date'), '%Y-%m-%d'),
        description=data.get('description', ''),
        created_by=current_user['id']
    )
    
    db.session.add(payment)
    db.session.commit()
    
    return jsonify({'message': 'Pagamento criado com sucesso', 'id': payment.id}), 201

@app.route('/api/payments/<int:payment_id>/billet', methods=['GET'])
def generate_billet(payment_id):
    payment = Payment.query.get_or_404(payment_id)
    client = Client.query.get(payment.client_id)
    
    # Gerar PDF do boleto
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    
    # Cabeçalho
    p.setFont("Helvetica-Bold", 16)
    p.drawString(100, 750, "BOLETO BANCÁRIO")
    
    # Informações do cliente
    p.setFont("Helvetica", 10)
    p.drawString(100, 700, f"Pagador: {client.name}")
    p.drawString(100, 685, f"CPF/CNPJ: {client.document}")
    p.drawString(100, 670, f"Endereço: {client.address}")
    
    # Informações do boleto
    p.drawString(100, 630, f"Valor: R$ {payment.amount:.2f}")
    p.drawString(100, 615, f"Vencimento: {payment.due_date.strftime('%d/%m/%Y')}")
    p.drawString(100, 600, f"Descrição: {payment.description}")
    
    # Instruções
    p.drawString(100, 550, "Instruções:")
    p.drawString(100, 535, "1. Pagável em qualquer agência bancária")
    p.drawString(100, 520, "2. Após o vencimento, cobrar juros de 1% ao mês")
    
    p.showPage()
    p.save()
    
    buffer.seek(0)
    return send_file(
        buffer,
        download_name=f"boleto_{payment.id}.pdf",
        as_attachment=True,
        mimetype='application/pdf'
    )

@app.route('/api/clients/<int:client_id>/payments', methods=['GET'])
def get_client_payments(client_id):
    payments = Payment.query.filter_by(client_id=client_id).all()
    return jsonify([{
        'id': payment.id,
        'amount': float(payment.amount),
        'due_date': payment.due_date.strftime('%Y-%m-%d'),
        'description': payment.description,
        'status': payment.status,
        'created_at': payment.created_at.isoformat()
    } for payment in payments])

if __name__ == '__main__':
    app.run(debug=True)
