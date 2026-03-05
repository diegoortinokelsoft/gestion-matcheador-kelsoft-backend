/**
 * logs.gs
 * API de Apps Script para la entidad Logs (auditoría)
 * 
 * Esquema de la hoja logs:
 * - log_id (alfanumérico)
 * - user_id (numérico)
 * - user_name (string)
 * - user_team (string)
 * - user_leader (string)
 * - log_date (date object - dd/mm/aaaa)
 * - log_hour (date object - hh:mm)
 * - log_description (string)
 * - log_location (string)
 * - log_ip (alfanumérico)
 */

const LOGS_SHEET_NAME = "logs";

/**
 * Registra un nuevo evento de log
 * 
 * @param {number} user_id - ID del usuario que genera el evento
 * @param {Object} logData - Datos del log
 * @returns {Object} Respuesta con el log_id creado o error
 */
function set_new_log(user_id, logData) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Generar un log_id único
    const log_id = generate_unique_id("LOG");
    
    // Obtener fecha y hora actuales
    const now = new Date();
    const log_date = format_date(now);
    const log_hour = format_time(now);
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "log_id") {
        newRow.push(log_id);
      } else if (header === "user_id") {
        newRow.push(user_id);
      } else if (header === "log_date") {
        newRow.push(log_date);
      } else if (header === "log_hour") {
        newRow.push(log_hour);
      } else {
        newRow.push(logData[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ log_id: log_id });
  } catch (error) {
    Logger.log(`Error in set_new_log: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene todos los logs
 * 
 * @returns {Object} Respuesta con array de logs o error
 */
function get_all_logs() {
  try {
    const logs = get_all_data_as_objects(LOGS_SHEET_NAME);
    return success_response(logs);
  } catch (error) {
    Logger.log(`Error in get_all_logs: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene logs de un usuario específico
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con array de logs o error
 */
function get_logs_by_user(user_id) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    const userIdIndex = headers.indexOf("user_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        const log = {};
        headers.forEach((header, index) => {
          log[header] = data[i][index];
        });
        logs.push(log);
      }
    }
    
    return success_response(logs);
  } catch (error) {
    Logger.log(`Error in get_logs_by_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene logs de un equipo específico
 * 
 * @param {string} user_team - Nombre del equipo
 * @returns {Object} Respuesta con array de logs o error
 */
function get_logs_by_team(user_team) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    const teamIndex = headers.indexOf("user_team");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][teamIndex] === user_team) {
        const log = {};
        headers.forEach((header, index) => {
          log[header] = data[i][index];
        });
        logs.push(log);
      }
    }
    
    return success_response(logs);
  } catch (error) {
    Logger.log(`Error in get_logs_by_team: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene logs de los usuarios de un líder específico
 * 
 * @param {string} user_leader - Nombre del líder
 * @returns {Object} Respuesta con array de logs o error
 */
function get_logs_by_leader(user_leader) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    const leaderIndex = headers.indexOf("user_leader");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][leaderIndex] === user_leader) {
        const log = {};
        headers.forEach((header, index) => {
          log[header] = data[i][index];
        });
        logs.push(log);
      }
    }
    
    return success_response(logs);
  } catch (error) {
    Logger.log(`Error in get_logs_by_leader: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene un log específico por su ID
 * 
 * @param {string} log_id - ID del log
 * @returns {Object} Respuesta con el log o error
 */
function get_log_by_id(log_id) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logIdIndex = headers.indexOf("log_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][logIdIndex] === log_id) {
        const log = {};
        headers.forEach((header, index) => {
          log[header] = data[i][index];
        });
        return success_response(log);
      }
    }
    
    return error_response("LOG_NOT_FOUND", "Log not found", { log_id: log_id });
  } catch (error) {
    Logger.log(`Error in get_log_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene logs filtrados por fecha
 * 
 * @param {string} log_date - Fecha en formato dd/mm/aaaa
 * @returns {Object} Respuesta con array de logs o error
 */
function get_logs_by_date(log_date) {
  try {
    const sheet = get_sheet_by_name(LOGS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const logs = [];
    const dateIndex = headers.indexOf("log_date");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][dateIndex] === log_date) {
        const log = {};
        headers.forEach((header, index) => {
          log[header] = data[i][index];
        });
        logs.push(log);
      }
    }
    
    return success_response(logs);
  } catch (error) {
    Logger.log(`Error in get_logs_by_date: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
