/**
 * vacations.gs
 * API de Apps Script para la entidad Vacaciones
 * 
 * Esquema de la hoja vacations:
 * - vacation_id (alfanumérico)
 * - user_id (numérico)
 * - user_name (string)
 * - user_team (string)
 * - user_leader (string)
 * - vacation_init_date (date object - dd/mm/aaaa)
 * - vacation_end_date (date object - dd/mm/aaaa)
 * - vacation_is_approved_by_leader (booleano: true/false/vacío)
 */

const VACATIONS_SHEET_NAME = "vacations";

/**
 * Crea una nueva solicitud de vacaciones
 * 
 * @param {number} user_id - ID del usuario
 * @param {Object} vacationData - Datos de la solicitud
 * @returns {Object} Respuesta con el vacation_id creado o error
 */
function set_new_vacation(user_id, vacationData) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Generar un vacation_id único
    const vacation_id = generate_unique_id("VAC");
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "vacation_id") {
        newRow.push(vacation_id);
      } else if (header === "user_id") {
        newRow.push(user_id);
      } else if (header === "vacation_is_approved_by_leader") {
        newRow.push(""); // Inicialmente vacío (pendiente)
      } else {
        newRow.push(vacationData[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ vacation_id: vacation_id });
  } catch (error) {
    Logger.log(`Error in set_new_vacation: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Aprueba una solicitud de vacaciones
 * 
 * @param {string} vacation_id - ID de la solicitud
 * @returns {Object} Respuesta con éxito o error
 */
function approve_vacation(vacation_id) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacationIdIndex = headers.indexOf("vacation_id");
    const approvedIndex = headers.indexOf("vacation_is_approved_by_leader");
    
    // Buscar la solicitud
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][vacationIdIndex] === vacation_id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("VACATION_NOT_FOUND", "Vacation not found", { vacation_id: vacation_id });
    }
    
    // Actualizar el estado a aprobado
    sheet.getRange(rowIndex, approvedIndex + 1).setValue(true);
    
    return success_response({ 
      vacation_id: vacation_id, 
      approved: true 
    });
  } catch (error) {
    Logger.log(`Error in approve_vacation: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Rechaza una solicitud de vacaciones
 * 
 * @param {string} vacation_id - ID de la solicitud
 * @returns {Object} Respuesta con éxito o error
 */
function deny_vacation(vacation_id) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacationIdIndex = headers.indexOf("vacation_id");
    const approvedIndex = headers.indexOf("vacation_is_approved_by_leader");
    
    // Buscar la solicitud
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][vacationIdIndex] === vacation_id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("VACATION_NOT_FOUND", "Vacation not found", { vacation_id: vacation_id });
    }
    
    // Actualizar el estado a rechazado
    sheet.getRange(rowIndex, approvedIndex + 1).setValue(false);
    
    return success_response({ 
      vacation_id: vacation_id, 
      denied: true 
    });
  } catch (error) {
    Logger.log(`Error in deny_vacation: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene todas las solicitudes de vacaciones
 * 
 * @returns {Object} Respuesta con array de solicitudes o error
 */
function get_all_vacations() {
  try {
    const vacations = get_all_data_as_objects(VACATIONS_SHEET_NAME);
    return success_response(vacations);
  } catch (error) {
    Logger.log(`Error in get_all_vacations: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene solicitudes de vacaciones de un usuario
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con array de solicitudes o error
 */
function get_vacations_by_user(user_id) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacations = [];
    const userIdIndex = headers.indexOf("user_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        const vacation = {};
        headers.forEach((header, index) => {
          vacation[header] = data[i][index];
        });
        vacations.push(vacation);
      }
    }
    
    return success_response(vacations);
  } catch (error) {
    Logger.log(`Error in get_vacations_by_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene solicitudes de vacaciones de un equipo
 * 
 * @param {string} user_team - Nombre del equipo
 * @returns {Object} Respuesta con array de solicitudes o error
 */
function get_vacations_by_team(user_team) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacations = [];
    const teamIndex = headers.indexOf("user_team");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][teamIndex] === user_team) {
        const vacation = {};
        headers.forEach((header, index) => {
          vacation[header] = data[i][index];
        });
        vacations.push(vacation);
      }
    }
    
    return success_response(vacations);
  } catch (error) {
    Logger.log(`Error in get_vacations_by_team: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene solicitudes de vacaciones de los usuarios de un líder
 * 
 * @param {string} user_leader - Nombre del líder
 * @returns {Object} Respuesta con array de solicitudes o error
 */
function get_vacations_by_leader(user_leader) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacations = [];
    const leaderIndex = headers.indexOf("user_leader");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][leaderIndex] === user_leader) {
        const vacation = {};
        headers.forEach((header, index) => {
          vacation[header] = data[i][index];
        });
        vacations.push(vacation);
      }
    }
    
    return success_response(vacations);
  } catch (error) {
    Logger.log(`Error in get_vacations_by_leader: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene una solicitud de vacaciones por su ID
 * 
 * @param {string} vacation_id - ID de la solicitud
 * @returns {Object} Respuesta con la solicitud o error
 */
function get_vacation_by_id(vacation_id) {
  try {
    const sheet = get_sheet_by_name(VACATIONS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const vacationIdIndex = headers.indexOf("vacation_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][vacationIdIndex] === vacation_id) {
        const vacation = {};
        headers.forEach((header, index) => {
          vacation[header] = data[i][index];
        });
        return success_response(vacation);
      }
    }
    
    return error_response("VACATION_NOT_FOUND", "Vacation not found", { vacation_id: vacation_id });
  } catch (error) {
    Logger.log(`Error in get_vacation_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
