# Test de Work Sessions (Postman)

## 1) Prerrequisitos
- Base URL: `{{base_url}}` (ej: `http://localhost:3000`)
- Endpoints protegidos por JWT.
- Definir en Postman:
  - `{{admin_token}}`
  - `{{leader_token}}`
  - `{{user_id_target}}` (ID numerico como string, ej: `"23"`)
  - `{{session_date}}` en formato `DD/MM/YYYY` (ej: `04/03/2026`)

## 2) Login (obtener token)
### POST `{{base_url}}/auth/login`
Body:
```json
{
  "email": "admin@empresa.com",
  "password": "tu_password"
}
```
Guardar `data.access_token` como `{{admin_token}}` o `{{leader_token}}` segun usuario.

## 3) Crear sesion individual (idempotente)
### POST `{{base_url}}/work_sessions`
Headers:
- `Authorization: Bearer {{admin_token}}` (o `{{leader_token}}`)

Body:
```json
{
  "user_id": "{{user_id_target}}",
  "session_date": "{{session_date}}",
  "session_status": "OPEN",
  "goal_mode": "TASKS",
  "goal_target_total": 5
}
```

Validaciones esperadas:
- Primera vez: HTTP `201`.
- Si ya existe sesion OPEN para ese usuario/fecha: HTTP `200` y devuelve la existente.
- Si token LEADER fuera de scope: HTTP `403` (`FORBIDDEN`).

## 4) Generar sesiones del dia (batch)
### POST `{{base_url}}/work_sessions/generate_daily`
Headers:
- `Authorization: Bearer {{admin_token}}` (o `{{leader_token}}`)

Body minimo:
```json
{
  "session_date": "{{session_date}}"
}
```

Body completo (ADMIN):
```json
{
  "session_date": "{{session_date}}",
  "leader_id": 7,
  "team_id": "TEAM_A",
  "seed_items": true,
  "allow_closed": false
}
```

Campos esperados en respuesta:
```json
{
  "session_date": "04/03/2026",
  "created_sessions": 0,
  "existing_sessions": 0,
  "seeded_items": 0,
  "skipped": [],
  "sessions": []
}
```

Validaciones esperadas:
- `seed_items` default `true` si se omite.
- `allow_closed` default `false` si se omite.
- LEADER con `leader_id` o `team_id` en body: HTTP `403`.
- Si hay cerrada y `allow_closed=false`: en `skipped` aparece `closed_exists`.

## 5) Ver sesiones creadas por rango (fix mapping/filtros)
### GET `{{base_url}}/work_sessions?date_from={{session_date}}&date_to={{session_date}}`
Headers:
- `Authorization: Bearer {{admin_token}}`

Opcionales de filtro:
- `user_id`
- `team_id`
- `leader_id`
- `status` (`OPEN`, `CLOSED`, `CANCELLED`)
- `page`, `pageSize`

Validaciones esperadas:
- Debe devolver las sesiones nuevas generadas para esa fecha.
- Filtros `team_id`/`leader_id` deben funcionar (backend mapea a `user_team`/`user_leader`).

## 6) Probar flujo operativo tras batch
1. Tomar un `session_id` de la respuesta de `generate_daily`.
2. Crear/actualizar item:
   - POST `{{base_url}}/work_sessions/{{session_id}}/items`
3. Cerrar sesion:
   - POST `{{base_url}}/work_sessions/{{session_id}}/close`

Body item ejemplo:
```json
{
  "initiative_id": "INIT-001",
  "tasks_done": 1
}
```

## 7) Casos de error recomendados
- `session_date` invalida (`"2026/03/04"`): HTTP `400` (`VALIDATION_ERROR`).
- `user_id` invalido (`"abc"`): HTTP `400` (`VALIDATION_ERROR`).
- LEADER creando sesion para usuario fuera de su equipo: HTTP `403`.
- Usuario sin rol ADMIN/LEADER en create/generate: HTTP `403`.
