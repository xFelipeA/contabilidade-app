const API = "URL_DO_RENDER";

async function login() {
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const resp = await fetch(API + "/login", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email, password})
    });

    const data = await resp.json();

    if (resp.ok) {
        document.getElementById("login").style.display = "none";
        document.getElementById("dashboard").style.display = "block";
    } else {
        alert("Erro no login");
    }
}

async function listarClientes() {
    const resp = await fetch(API + "/clientes");
    const clientes = await resp.json();

    document.getElementById("clientes").innerHTML = clientes
        .map(c => `<p>${c.nome} – ${c.email}</p>`)
        .join("");
}
