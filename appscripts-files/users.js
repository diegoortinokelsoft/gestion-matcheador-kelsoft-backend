/**
 * users.gs
 * API de Apps Script para la entidad Usuarios
 * 
 * Esquema de la hoja users:
 * - user_id (numérico)
 * - user_is_active (booleano)
 * - user_name (string)
 * - user_meli (string)
 * - user_status (string)
 * - user_status_detail (string)
 * - user_team (string)
 * - user_leader_id (numérico)
 * - user_leader_name (string)
 * - user_role (string)
 * - user_cuil (numérico)
 * - user_mail (string)
 * - user_serial (string)
 * - user_entry_date (date object - dd/mm/aaaa)
 * - user_retirement_date (date object - dd/mm/aaaa)
 */

const USERS_SHEET_NAME = "users";

/**
 * Obtiene un usuario por su ID
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con el usuario o error
 */
function get_user_by_id(user_id) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Buscar el usuario
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === user_id) { // user_id está en la columna 0
        const user = {};
        headers.forEach((header, index) => {
          user[header] = data[i][index];
        });
        
        // Si el usuario no está activo, no lo retornamos
        if (!user.user_is_active) {
          return error_response("USER_NOT_FOUND", "User not found", { user_id: user_id });
        }
        
        return success_response(user);
      }
    }
    
    return error_response("USER_NOT_FOUND", "User not found", { user_id: user_id });
  } catch (error) {
    Logger.log(`Error in get_user_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene todos los usuarios activos
 * 
 * @returns {Object} Respuesta con array de usuarios o error
 */
function get_all_users() {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();

    if (!data || data.length < 2) {
      return success_response([]);
    }

    // ✅ headers normalizados (trim)
    const headers = data[0].map(h => String(h).trim());
    const users = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // saltear fila vacía
      const isEmptyRow = row.every(v => v === "" || v === null);
      if (isEmptyRow) continue;

      const user = {};
      headers.forEach((header, index) => {
        user[header] = row[index];
      });

      // ✅ normalizar active: acepta true / "TRUE" / "true" / 1 / "1" / "SI"
      const rawActive = user["user_is_active"];
      const isActive =
        rawActive === true ||
        rawActive === 1 ||
        String(rawActive).trim().toLowerCase() === "true" ||
        String(rawActive).trim() === "1" ||
        String(rawActive).trim().toLowerCase() === "si";

      if (isActive) users.push(user);
    }

    return success_response(users);
  } catch (error) {
    Logger.log(`Error in get_all_users: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene usuarios por ID de líder
 * 
 * @param {number} leader_id - ID del líder
 * @returns {Object} Respuesta con array de usuarios o error
 */
function get_users_by_leader_id(leader_id) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const users = [];
    const leaderIdIndex = headers.indexOf("user_leader_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][leaderIdIndex] === leader_id) {
        const user = {};
        headers.forEach((header, index) => {
          user[header] = data[i][index];
        });
        
        // Solo incluir usuarios activos
        if (user.user_is_active) {
          users.push(user);
        }
      }
    }
    
    return success_response(users);
  } catch (error) {
    Logger.log(`Error in get_users_by_leader_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene usuarios por equipo
 * 
 * @param {string} user_team - Nombre del equipo
 * @returns {Object} Respuesta con array de usuarios o error
 */
function get_users_by_team(user_team) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const users = [];
    const teamIndex = headers.indexOf("user_team");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][teamIndex] === user_team) {
        const user = {};
        headers.forEach((header, index) => {
          user[header] = data[i][index];
        });
        
        // Solo incluir usuarios activos
        if (user.user_is_active) {
          users.push(user);
        }
      }
    }
    
    return success_response(users);
  } catch (error) {
    Logger.log(`Error in get_users_by_team: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene usuarios por estado
 * 
 * @param {string} user_status - Estado del usuario
 * @returns {Object} Respuesta con array de usuarios o error
 */
function get_users_by_status(user_status) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const users = [];
    const statusIndex = headers.indexOf("user_status");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIndex] === user_status) {
        const user = {};
        headers.forEach((header, index) => {
          user[header] = data[i][index];
        });
        
        // Solo incluir usuarios activos
        if (user.user_is_active) {
          users.push(user);
        }
      }
    }
    
    return success_response(users);
  } catch (error) {
    Logger.log(`Error in get_users_by_status: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene usuarios por rol
 * 
 * @param {string} user_role - Rol del usuario
 * @returns {Object} Respuesta con array de usuarios o error
 */
function get_users_by_role(user_role) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const users = [];
    const roleIndex = headers.indexOf("user_role");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][roleIndex] === user_role) {
        const user = {};
        headers.forEach((header, index) => {
          user[header] = data[i][index];
        });
        
        // Solo incluir usuarios activos
        if (user.user_is_active) {
          users.push(user);
        }
      }
    }
    
    return success_response(users);
  } catch (error) {
    Logger.log(`Error in get_users_by_role: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Crea un nuevo usuario
 * 
 * @param {Object} userData - Datos del nuevo usuario
 * @returns {Object} Respuesta con el user_id creado o error
 */
function set_new_user(userData) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Generar nuevo user_id (máximo actual + 1)
    let maxId = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] > maxId) {
        maxId = data[i][0];
      }
    }
    const newUserId = maxId + 1;
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "user_id") {
        newRow.push(newUserId);
      } else if (header === "user_is_active") {
        newRow.push(true); // Por defecto activo
      } else if (header === "user_entry_date") {
        newRow.push(format_date(new Date()));
      } else {
        newRow.push(userData[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ user_id: newUserId });
  } catch (error) {
    Logger.log(`Error in set_new_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Modifica un usuario existente
 * 
 * @param {number} user_id - ID del usuario
 * @param {Object} userData - Datos a actualizar
 * @returns {Object} Respuesta con éxito o error
 */
function modify_user(user_id, userData) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Buscar el usuario
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === user_id) {
        rowIndex = i + 1; // +1 porque getRange usa 1-based index
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("USER_NOT_FOUND", "User not found", { user_id: user_id });
    }
    
    // Actualizar los campos
    headers.forEach((header, index) => {
      if (userData.hasOwnProperty(header) && header !== "user_id") {
        sheet.getRange(rowIndex, index + 1).setValue(userData[header]);
      }
    });
    
    return success_response({ user_id: user_id, updated: true });
  } catch (error) {
    Logger.log(`Error in modify_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Desactiva o activa un usuario (borrado lógico)
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con éxito o error
 */
function disable_or_allow_user(user_id) {
  try {
    const sheet = get_sheet_by_name(USERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const isActiveIndex = headers.indexOf("user_is_active");
    
    // Buscar el usuario
    let rowIndex = -1;
    let currentStatus = null;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === user_id) {
        rowIndex = i + 1;
        currentStatus = data[i][isActiveIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("USER_NOT_FOUND", "User not found", { user_id: user_id });
    }
    
    // Cambiar el estado
    const newStatus = !currentStatus;
    sheet.getRange(rowIndex, isActiveIndex + 1).setValue(newStatus);
    
    return success_response({ 
      user_id: user_id, 
      user_is_active: newStatus 
    });
  } catch (error) {
    Logger.log(`Error in disable_or_allow_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
