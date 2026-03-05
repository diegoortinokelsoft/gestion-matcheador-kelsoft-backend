/**
 * passwords.gs
 * API de Apps Script para la entidad Contraseñas
 * 
 * Esquema de la hoja passwords:
 * - user_id (numérico)
 * - user_name (string)
 * - user_mail (string)
 * - password_hash (string)
 * 
 * IMPORTANTE:
 * - Esta capa NO autentica usuarios finales
 * - NO valida JWT
 * - NO maneja contraseñas en texto plano
 * - Solo almacena y recupera hashes
 */

const PASSWORDS_SHEET_NAME = "passwords";

/**
 * Obtiene todos los datos de login (para cache del backend)
 * 
 * @returns {Object} Respuesta con array de datos de login o error
 */
function get_login_data() {
  try {
    const sheet = get_sheet_by_name(PASSWORDS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const loginData = [];
    
    for (let i = 1; i < data.length; i++) {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = data[i][index];
      });
      loginData.push(record);
    }
    
    return success_response(loginData);
  } catch (error) {
    Logger.log(`Error in get_login_data: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Resetea la contraseña de un usuario
 * Genera un nuevo hash temporal
 * 
 * NOTA: El backend debe enviar el email con la contraseña temporal
 * 
 * @param {number} user_id - ID del usuario
 * @param {string} tempPasswordHash - Hash de la contraseña temporal
 * @returns {Object} Respuesta con éxito o error
 */
function reset_user_password(user_id, tempPasswordHash) {
  try {
    const sheet = get_sheet_by_name(PASSWORDS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdIndex = headers.indexOf("user_id");
    const passwordHashIndex = headers.indexOf("password_hash");
    
    // Buscar el registro del usuario
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("USER_NOT_FOUND", "User not found in passwords", { user_id: user_id });
    }
    
    // Actualizar el hash
    sheet.getRange(rowIndex, passwordHashIndex + 1).setValue(tempPasswordHash);
    
    return success_response({ 
      user_id: user_id, 
      password_reset: true 
    });
  } catch (error) {
    Logger.log(`Error in reset_user_password: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Actualiza la contraseña de un usuario
 * 
 * @param {number} user_id - ID del usuario
 * @param {string} newPasswordHash - Nuevo hash de contraseña
 * @returns {Object} Respuesta con éxito o error
 */
function update_user_password(user_id, newPasswordHash) {
  try {
    const sheet = get_sheet_by_name(PASSWORDS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdIndex = headers.indexOf("user_id");
    const passwordHashIndex = headers.indexOf("password_hash");
    
    // Buscar el registro del usuario
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("USER_NOT_FOUND", "User not found in passwords", { user_id: user_id });
    }
    
    // Actualizar el hash
    sheet.getRange(rowIndex, passwordHashIndex + 1).setValue(newPasswordHash);
    
    return success_response({ 
      user_id: user_id, 
      password_updated: true 
    });
  } catch (error) {
    Logger.log(`Error in update_user_password: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Crea un nuevo registro de contraseña para un usuario
 * Útil cuando se crea un nuevo usuario
 * 
 * @param {number} user_id - ID del usuario
 * @param {string} user_name - Nombre del usuario
 * @param {string} user_mail - Email del usuario
 * @param {string} passwordHash - Hash de la contraseña
 * @returns {Object} Respuesta con éxito o error
 */
function create_user_password(user_id, user_name, user_mail, passwordHash) {
  try {
    const sheet = get_sheet_by_name(PASSWORDS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdIndex = headers.indexOf("user_id");
    
    // Verificar que no exista ya
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        return error_response("USER_ALREADY_EXISTS", "Password record already exists", { user_id: user_id });
      }
    }
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "user_id") {
        newRow.push(user_id);
      } else if (header === "user_name") {
        newRow.push(user_name);
      } else if (header === "user_mail") {
        newRow.push(user_mail);
      } else if (header === "password_hash") {
        newRow.push(passwordHash);
      } else {
        newRow.push("");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ 
      user_id: user_id, 
      password_created: true 
    });
  } catch (error) {
    Logger.log(`Error in create_user_password: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene el hash de contraseña de un usuario específico
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con el hash o error
 */
function get_user_password_hash(user_id) {
  try {
    const sheet = get_sheet_by_name(PASSWORDS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdIndex = headers.indexOf("user_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        const record = {};
        headers.forEach((header, index) => {
          record[header] = data[i][index];
        });
        return success_response(record);
      }
    }
    
    return error_response("USER_NOT_FOUND", "User not found in passwords", { user_id: user_id });
  } catch (error) {
    Logger.log(`Error in get_user_password_hash: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}