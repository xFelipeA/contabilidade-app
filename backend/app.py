from flask import Flask, request, jsonify
from flask_cors import CORS
from models import db, User, Cliente
import os

app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)

@app.route("/")
def home():
    return {"status": "Backend rodando com sucesso!"}

# Criar usuário
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    user = User(email=data["email"], password=data["password"], role="user")
    db.session.add(user)
    db.session.commit()
    return {"message": "Usuário criado com sucesso"}

# Login
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    user = User.query.filter_by(email=data["email"]).first()
    if user and user.password == data["password"]:
        return {"message": "Login autorizado", "role": user.role}
    return {"message": "Credenciais inválidas"}, 401

if __name__ == "__main__":
    app.run()
