/**
 * work_sessions.gs
 * API de Apps Script para la entidad Jornadas de Trabajo
 * 
 * Esquema de la hoja work_sessions:
 * - session_id (string)
 * - user_id (number)
 * - user_name (string)
 * - user_team (string)
 * - user_leader (string)
 * - session_date (date object - dd/mm/aaaa)
 * - session_start_at (string - dd/mm/aaaa)
 * - session_end_at (string - dd/mm/aaaa)
 * - session_status (string: OPEN, CLOSED, CANCELLED)
 * - total_tasks_done (number - valor derivado)
 * - total_initiatives_count (number - valor derivado)
 * - goal_mode (string: PER_INITIATIVE, SESSION_TOTAL)
 * - goal_target_total (number)
 * - goal_is_met (boolean - valor derivado)
 * - created_at (string - dd/mm/aaaa)
 * - updated_at (string - dd/mm/aaaa)
 * - updated_by (number)
 * - version (number)
 */

const WORK_SESSIONS_SHEET_NAME = "work_sessions";

/**
 * Crea una nueva jornada de trabajo en estado OPEN
 * 
 * @param {number} user_id - ID del usuario
 * @param {Object} session_data - Datos de la jornada
 * @returns {Object} Respuesta con el session_id creado o error
 */
function create_session(user_id, session_data) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Generar un session_id único
    const session_id = generate_unique_id("SESS");
    const now = format_date(new Date());
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "session_id") {
        newRow.push(session_id);
      } else if (header === "user_id") {
        newRow.push(user_id);
      } else if (header === "session_status") {
        newRow.push("OPEN");
      } else if (header === "session_start_at") {
        newRow.push(session_data.session_start_at || now);
      } else if (header === "session_date") {
        newRow.push(session_data.session_date || now);
      } else if (header === "created_at") {
        newRow.push(now);
      } else if (header === "updated_at") {
        newRow.push(now);
      } else if (header === "version") {
        newRow.push(1);
      } else if (header === "total_tasks_done") {
        newRow.push(0);
      } else if (header === "total_initiatives_count") {
        newRow.push(0);
      } else if (header === "goal_is_met") {
        newRow.push(false);
      } else {
        newRow.push(session_data[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ session_id: session_id });
  } catch (error) {
    Logger.log(`Error in create_session: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene una jornada por su ID
 * 
 * @param {string} session_id - ID de la jornada
 * @returns {Object} Respuesta con la jornada o error
 */
function get_session_by_id(session_id) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sessionIdIndex = headers.indexOf("session_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][sessionIdIndex] === session_id) {
        const session = {};
        headers.forEach((header, index) => {
          session[header] = data[i][index];
        });
        return success_response(session);
      }
    }
    
    return error_response("SESSION_NOT_FOUND", "Session not found", { session_id: session_id });
  } catch (error) {
    Logger.log(`Error in get_session_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene la jornada abierta de un usuario en una fecha específica
 * 
 * @param {number} user_id - ID del usuario
 * @param {string} session_date - Fecha en formato dd/mm/aaaa
 * @returns {Object} Respuesta con la jornada o error si no existe
 */
function get_open_session_by_user_and_date(user_id, session_date) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdIndex = headers.indexOf("user_id");
    const sessionDateIndex = headers.indexOf("session_date");
    const sessionStatusIndex = headers.indexOf("session_status");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id && 
          data[i][sessionDateIndex] === session_date &&
          data[i][sessionStatusIndex] === "OPEN") {
        const session = {};
        headers.forEach((header, index) => {
          session[header] = data[i][index];
        });
        return success_response(session);
      }
    }
    
    return error_response("SESSION_NOT_FOUND", "No open session found for user and date", { 
      user_id: user_id,
      session_date: session_date
    });
  } catch (error) {
    Logger.log(`Error in get_open_session_by_user_and_date: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Lista jornadas con filtros opcionales
 * 
 * @param {Object} filters - Filtros opcionales (user_id, session_date, user_team, user_leader, session_status)
 * @returns {Object} Respuesta con array de jornadas o error
 */
function list_sessions(filters = {}) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sessions = [];
    
    for (let i = 1; i < data.length; i++) {
      const session = {};
      headers.forEach((header, index) => {
        session[header] = data[i][index];
      });
      
      // Aplicar filtros
      let matchesFilters = true;
      
      if (filters.user_id && session.user_id !== filters.user_id) {
        matchesFilters = false;
      }
      
      if (filters.session_date && session.session_date !== filters.session_date) {
        matchesFilters = false;
      }
      
      if (filters.user_team && session.user_team !== filters.user_team) {
        matchesFilters = false;
      }
      
      if (filters.user_leader && session.user_leader !== filters.user_leader) {
        matchesFilters = false;
      }
      
      if (filters.session_status && session.session_status !== filters.session_status) {
        matchesFilters = false;
      }
      
      if (matchesFilters) {
        sessions.push(session);
      }
    }
    
    return success_response(sessions);
  } catch (error) {
    Logger.log(`Error in list_sessions: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Actualiza campos específicos de una jornada
 * 
 * @param {string} session_id - ID de la jornada
 * @param {Object} patch_data - Campos a actualizar
 * @param {number} updated_by - ID del usuario que realiza la actualización
 * @returns {Object} Respuesta con éxito o error
 */
function update_session(session_id, patch_data, updated_by) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sessionIdIndex = headers.indexOf("session_id");
    const versionIndex = headers.indexOf("version");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    
    // Buscar la jornada
    let rowIndex = -1;
    let currentVersion = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][sessionIdIndex] === session_id) {
        rowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("SESSION_NOT_FOUND", "Session not found", { session_id: session_id });
    }
    
    // Actualizar los campos
    headers.forEach((header, index) => {
      if (patch_data.hasOwnProperty(header) && header !== "session_id" && header !== "version") {
        sheet.getRange(rowIndex, index + 1).setValue(patch_data[header]);
      }
    });
    
    // Incrementar versión
    sheet.getRange(rowIndex, versionIndex + 1).setValue(currentVersion + 1);
    
    // Actualizar metadatos
    sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(format_date(new Date()));
    sheet.getRange(rowIndex, updatedByIndex + 1).setValue(updated_by);
    
    return success_response({ 
      session_id: session_id, 
      updated: true,
      version: currentVersion + 1
    });
  } catch (error) {
    Logger.log(`Error in update_session: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Cierra una jornada y actualiza los valores derivados
 * 
 * @param {string} session_id - ID de la jornada
 * @param {Object} close_data - Datos de cierre (valores derivados calculados por el backend)
 * @returns {Object} Respuesta con éxito o error
 */
function close_session(session_id, close_data) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sessionIdIndex = headers.indexOf("session_id");
    const statusIndex = headers.indexOf("session_status");
    const versionIndex = headers.indexOf("version");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    
    // Buscar la jornada
    let rowIndex = -1;
    let currentVersion = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][sessionIdIndex] === session_id) {
        rowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("SESSION_NOT_FOUND", "Session not found", { session_id: session_id });
    }
    
    // Actualizar estado a CLOSED
    sheet.getRange(rowIndex, statusIndex + 1).setValue("CLOSED");
    
    // Actualizar fecha de cierre
    const endAtIndex = headers.indexOf("session_end_at");
    sheet.getRange(rowIndex, endAtIndex + 1).setValue(format_date(new Date()));
    
    // Actualizar valores derivados
    headers.forEach((header, index) => {
      if (close_data.hasOwnProperty(header) && header !== "session_id" && header !== "version") {
        sheet.getRange(rowIndex, index + 1).setValue(close_data[header]);
      }
    });
    
    // Incrementar versión
    sheet.getRange(rowIndex, versionIndex + 1).setValue(currentVersion + 1);
    
    // Actualizar metadatos
    sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(format_date(new Date()));
    if (close_data.updated_by) {
      sheet.getRange(rowIndex, updatedByIndex + 1).setValue(close_data.updated_by);
    }
    
    return success_response({ 
      session_id: session_id, 
      closed: true,
      version: currentVersion + 1
    });
  } catch (error) {
    Logger.log(`Error in close_session: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
