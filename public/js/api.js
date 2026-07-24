// Helper central para todas las llamadas a la API
const Api = {
  token() {
    return localStorage.getItem('marisquito_token');
  },
  usuario() {
    const raw = localStorage.getItem('marisquito_usuario');
    return raw ? JSON.parse(raw) : null;
  },
  guardarSesion(token, usuario) {
    localStorage.setItem('marisquito_token', token);
    localStorage.setItem('marisquito_usuario', JSON.stringify(usuario));
  },
  cerrarSesion() {
    localStorage.removeItem('marisquito_token');
    localStorage.removeItem('marisquito_usuario');
    window.location.href = '/login.html';
  },
  async solicitud(metodo, ruta, cuerpo) {
    const opciones = {
      method: metodo,
      headers: { 'Content-Type': 'application/json' }
    };
    const token = this.token();
    if (token) opciones.headers['Authorization'] = `Bearer ${token}`;
    if (cuerpo) opciones.body = JSON.stringify(cuerpo);

    const resp = await fetch(`${API_BASE_URL}${ruta}`, opciones);
    const data = await resp.json().catch(() => ({}));

    if (resp.status === 401) {
      this.cerrarSesion();
      throw new Error('Tu sesión expiró, vuelve a entrar');
    }
    if (!resp.ok) {
      throw new Error(data.error || 'Ocurrió un error inesperado');
    }
    return data;
  },
  get(ruta) { return this.solicitud('GET', ruta); },
  post(ruta, cuerpo) { return this.solicitud('POST', ruta, cuerpo); },
  patch(ruta, cuerpo) { return this.solicitud('PATCH', ruta, cuerpo); },
  put(ruta, cuerpo) { return this.solicitud('PUT', ruta, cuerpo); },
  del(ruta) { return this.solicitud('DELETE', ruta); }
};

// Protege una página: si no hay token, manda a login
function exigirSesion(rolesPermitidos) {
  const usuario = Api.usuario();
  if (!Api.token() || !usuario) {
    window.location.href = '/login.html';
    return null;
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    mostrarToast('No tienes acceso a esta sección', true);
    setTimeout(() => { window.location.href = '/login.html'; }, 1200);
    return null;
  }
  return usuario;
}

function mostrarToast(mensaje, esError) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = mensaje;
  toast.classList.toggle('error', !!esError);
  toast.classList.add('mostrar');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('mostrar'), 3200);
}

function pintarBarraSuperior(usuario) {
  const el = document.getElementById('barra-usuario');
  if (!el) return;
  el.innerHTML = `
    <span>${usuario.nombre}</span>
    <span class="rol-badge">${usuario.rol}</span>
    <button class="btn-salir" onclick="Api.cerrarSesion()">Salir</button>
  `;
}
