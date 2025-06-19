# 🧠 Proyecto Zeta - Full Stack con React + Node + Prisma + MySQL

Base de proyecto para desarrollo interno del equipo. Tecnologías:

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **ORM:** Prisma
- **Base de datos:** MySQL (📍 ahora **local**, antes en Railway)
- **Estilos:** HTML + CSS básicos

---

## 📁 Estructura del Proyecto

```
Zeta-v2/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── routes/
│   │   └── utils/
│   ├── .env
│   ├── app.js
│   └── package.json
├── frontend/
│   └── package.json
├── package.json
```

---

## ⚠️ Verificación previa antes de empezar

Antes de correr el proyecto, asegurate de:

1. Tener **MySQL iniciado** (sea desde WAMP, XAMPP o servicio de Windows).
   - En Windows: ejecutá `services.msc` y asegurate que el servicio `MySQL` o `wampmysqld64` esté corriendo.
   - Si usás WAMP, el ícono debe estar **verde**.

2. Copiar los archivos `backend/.env.example` y `backend/.env.secrets.example` a
   `backend/.env` y `backend/.env.secrets` respectivamente. Allí deberás colocar
   tu cadena `DATABASE_URL`, la clave de Clerk y cualquier otra credencial.

---

## ⚙️ Inicio del proyecto (backend + frontend juntos)

Ya configurado para ejecutar ambos servicios en paralelo con un solo comando:

```bash
npm run dev
```

Este script utiliza `concurrently` para levantar:

- El backend con Express (`backend/app.js`)
- El frontend con Vite (`frontend/`)

### Scripts definidos

**En el `package.json` raíz:**
```json
"scripts": {
  "dev": "concurrently \"npm run server --prefix backend\" \"npm run dev --prefix frontend\""
}
```

**En `backend/package.json`:**
```json
"scripts": {
  "server": "node app.js"
}
```

**En `frontend/package.json`:**
```json
"scripts": {
  "dev": "vite"
}
```

---

## 🧪 Prisma CLI útil

```bash
npx prisma generate --schema backend/src/prisma/schema.prisma
npx prisma migrate dev --name init --schema backend/src/prisma/schema.prisma
npx prisma studio --schema backend/src/prisma/schema.prisma
```

Si Prisma tira errores por certificados SSL (usualmente por proxy o red corporativa), usá esto:
```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
npx prisma generate --schema backend/src/prisma/schema.prisma
```

---

## 🌐 Endpoints configurados

Todos empiezan con `/api`:

- `GET /api/` → últimos posts
- `GET /api/blog` → posts de usuario ID 1
- `GET /api/existeMail?email=` → verifica si existe email
- `GET /api/product?query=` → búsqueda de producto OpenFoodFacts
- `GET /api/searchProducts?query=` → resultados múltiples
- `POST /api/darLike` → like a un post
- `POST /api/darDislike` → dislike a un post
- `POST /api/publicarPost` → crea nuevo post
- `GET /api/obtenerPosts` → lista completa de posts

---

## 🗃️ Base de Datos

### 🏠 Local (actual)

Creamos la base `zeta_local` desde MySQL Workbench o DBeaver:
```sql
CREATE DATABASE zeta_local;
```

Para migrar y generar:
```bash
cd backend
set NODE_TLS_REJECT_UNAUTHORIZED=0
npx prisma generate --schema src/prisma/schema.prisma
npx prisma migrate dev --name init --schema src/prisma/schema.prisma
cd ..
```

Visualización en navegador:
```bash
npx prisma studio --schema backend/src/prisma/schema.prisma
```

### ☁️ Railway (anterior)

Se usaba esta URL:
```env
DATABASE_URL="mysql://user:pass@railway_host:port/db"
```

Solo hay que actualizar `DATABASE_URL` en `backend/.env.secrets` si se quiere volver a usar Railway.

---

## 🖥️ Guía de instalación (una vez por computadora)

```bash
git clone https://github.com/KanterAlon/Zeta-v2.git
cd Zeta-v2

npm install
npm install --prefix backend
npm install --prefix frontend
npm install concurrently --save-dev

cd backend
set NODE_TLS_REJECT_UNAUTHORIZED=0
npx prisma generate --schema prisma/schema.prisma 
npx prisma migrate dev --name init --schema prisma/schema.prisma 
cd ..

npm run dev
```

---

Hecho con 💻 por el equipo de Zeta.

## 🔑 Autenticación Clerk

El frontend utiliza [Clerk](https://clerk.com/) para el inicio de sesión. Al iniciar o crear una cuenta,
se sincroniza automáticamente con nuestro backend y la base de datos en Supabase.

1. Copiá `frontend/.env.example` a `frontend/.env` y completá `VITE_CLERK_PUBLISHABLE_KEY`.
2. En `backend/.env.secrets` colocá tu `CLERK_SECRET_KEY` para que el servidor pueda verificar los tokens.
3. Iniciá la app con `npm run dev` y Clerk manejará las sesiones.
