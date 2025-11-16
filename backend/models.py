from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(200), unique=True)
    password = db.Column(db.String(200))
    role = db.Column(db.String(50))  # admin, gerente, funcionário

class Cliente(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(200))
    email = db.Column(db.String(200))
    cnpj = db.Column(db.String(50))
    comissao = db.Column(db.Float)
