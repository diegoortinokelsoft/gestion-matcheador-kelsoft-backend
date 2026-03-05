/**
 * initiative_members.gs
 * API de Apps Script para la gestión de miembros de iniciativas
 * 
 * Esquema de la hoja initiative_members:
 * - initiative_id (string)
 * - user_id (number)
 * - member_is_active (boolean)
 * - assigned_at (string - dd/mm/aaaa)
 * - assigned_by (number)
 * - created_at (string - dd/mm/aaaa)
 * - updated_at (string - dd/mm/aaaa)
 * - updated_by (number)
 * - version (number)
 * 
 * Regla de unicidad: (initiative_id + user_id)
 */

const INITIATIVE_MEMBERS_SHEET_NAME = "initiative_members";

/**
 * Lista los usuarios asignados a una iniciativa
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {boolean} onlyActive - Si es true, solo retorna miembros activos
 * @returns {Object} Respuesta con array de miembros o error
 */
function list_members_by_initiative(initiative_id, onlyActive = true) {
  try {
    const sheet = get_sheet_by_name(INITIATIVE_MEMBERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const members = [];
    const initiativeIdIndex = headers.indexOf("initiative_id");
    const isActiveIndex = headers.indexOf("member_is_active");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][initiativeIdIndex] === initiative_id) {
        const member = {};
        headers.forEach((header, index) => {
          member[header] = data[i][index];
        });
        
        // Filtrar por estado activo si se solicita
        if (!onlyActive || member.member_is_active === true) {
          members.push(member);
        }
      }
    }
    
    return success_response(members);
  } catch (error) {
    Logger.log(`Error in list_members_by_initiative: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Lista las iniciativas en las que participa un usuario
 * 
 * @param {number} user_id - ID del usuario
 * @param {boolean} onlyActive - Si es true, solo retorna iniciativas activas
 * @returns {Object} Respuesta con array de iniciativas o error
 */
function list_initiatives_by_user(user_id, onlyActive = true) {
  try {
    const sheet = get_sheet_by_name(INITIATIVE_MEMBERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiatives = [];
    const userIdIndex = headers.indexOf("user_id");
    const isActiveIndex = headers.indexOf("member_is_active");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        const member = {};
        headers.forEach((header, index) => {
          member[header] = data[i][index];
        });
        
        // Filtrar por estado activo si se solicita
        if (!onlyActive || member.member_is_active === true) {
          initiatives.push(member);
        }
      }
    }
    
    return success_response(initiatives);
  } catch (error) {
    Logger.log(`Error in list_initiatives_by_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Asigna un usuario a una iniciativa (crea o reactiva)
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {number} user_id - ID del usuario
 * @param {number} assignedBy - ID del usuario que realiza la asignación
 * @returns {Object} Respuesta con éxito o error
 */
function assign_user_to_initiative(initiative_id, user_id, assignedBy) {
  try {
    const sheet = get_sheet_by_name(INITIATIVE_MEMBERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiativeIdIndex = headers.indexOf("initiative_id");
    const userIdIndex = headers.indexOf("user_id");
    const isActiveIndex = headers.indexOf("member_is_active");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    const versionIndex = headers.indexOf("version");
    
    // Buscar si ya existe la asignación
    let existingRowIndex = -1;
    let currentVersion = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][initiativeIdIndex] === initiative_id && data[i][userIdIndex] === user_id) {
        existingRowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    const now = format_date(new Date());
    
    if (existingRowIndex !== -1) {
      // Reactivar la asignación existente
      sheet.getRange(existingRowIndex, isActiveIndex + 1).setValue(true);
      sheet.getRange(existingRowIndex, updatedAtIndex + 1).setValue(now);
      sheet.getRange(existingRowIndex, updatedByIndex + 1).setValue(assignedBy);
      sheet.getRange(existingRowIndex, versionIndex + 1).setValue(currentVersion + 1);
      
      return success_response({ 
        initiative_id: initiative_id,
        user_id: user_id,
        action: "reactivated"
      });
    } else {
      // Crear nueva asignación
      const newRow = [];
      headers.forEach(header => {
        if (header === "initiative_id") {
          newRow.push(initiative_id);
        } else if (header === "user_id") {
          newRow.push(user_id);
        } else if (header === "member_is_active") {
          newRow.push(true);
        } else if (header === "assigned_at") {
          newRow.push(now);
        } else if (header === "assigned_by") {
          newRow.push(assignedBy);
        } else if (header === "created_at") {
          newRow.push(now);
        } else if (header === "updated_at") {
          newRow.push(now);
        } else if (header === "updated_by") {
          newRow.push(assignedBy);
        } else if (header === "version") {
          newRow.push(1);
        } else {
          newRow.push("");
        }
      });
      
      sheet.appendRow(newRow);
      
      return success_response({ 
        initiative_id: initiative_id,
        user_id: user_id,
        action: "created"
      });
    }
  } catch (error) {
    Logger.log(`Error in assign_user_to_initiative: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Desasigna un usuario de una iniciativa (borrado lógico)
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {number} user_id - ID del usuario
 * @param {number} updatedBy - ID del usuario que realiza la desasignación
 * @returns {Object} Respuesta con éxito o error
 */
function remove_user_from_initiative(initiative_id, user_id, updatedBy) {
  try {
    const sheet = get_sheet_by_name(INITIATIVE_MEMBERS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiativeIdIndex = headers.indexOf("initiative_id");
    const userIdIndex = headers.indexOf("user_id");
    const isActiveIndex = headers.indexOf("member_is_active");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    const versionIndex = headers.indexOf("version");
    
    // Buscar la asignación
    let rowIndex = -1;
    let currentVersion = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][initiativeIdIndex] === initiative_id && data[i][userIdIndex] === user_id) {
        rowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("MEMBER_NOT_FOUND", "Member not found in initiative", { 
        initiative_id: initiative_id,
        user_id: user_id
      });
    }
    
    // Desactivar la asignación
    sheet.getRange(rowIndex, isActiveIndex + 1).setValue(false);
    sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(format_date(new Date()));
    sheet.getRange(rowIndex, updatedByIndex + 1).setValue(updatedBy);
    sheet.getRange(rowIndex, versionIndex + 1).setValue(currentVersion + 1);
    
    return success_response({ 
      initiative_id: initiative_id,
      user_id: user_id,
      removed: true
    });
  } catch (error) {
    Logger.log(`Error in remove_user_from_initiative: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Asigna múltiples usuarios a una iniciativa (operación masiva)
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {Array} user_ids - Array de IDs de usuarios
 * @param {number} assignedBy - ID del usuario que realiza la asignación
 * @returns {Object} Respuesta con éxito o error
 */
function bulk_assign_users(initiative_id, user_ids, assignedBy) {
  try {
    const results = [];
    const errors = [];
    
    user_ids.forEach(user_id => {
      const result = assign_user_to_initiative(initiative_id, user_id, assignedBy);
      
      if (result.ok) {
        results.push(result.data);
      } else {
        errors.push({ user_id: user_id, error: result.error });
      }
    });
    
    return success_response({ 
      assigned: results,
      errors: errors,
      total_assigned: results.length,
      total_errors: errors.length
    });
  } catch (error) {
    Logger.log(`Error in bulk_assign_users: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Desasigna múltiples usuarios de una iniciativa (operación masiva)
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {Array} user_ids - Array de IDs de usuarios
 * @param {number} updatedBy - ID del usuario que realiza la desasignación
 * @returns {Object} Respuesta con éxito o error
 */
function bulk_remove_users(initiative_id, user_ids, updatedBy) {
  try {
    const results = [];
    const errors = [];
    
    user_ids.forEach(user_id => {
      const result = remove_user_from_initiative(initiative_id, user_id, updatedBy);
      
      if (result.ok) {
        results.push(result.data);
      } else {
        errors.push({ user_id: user_id, error: result.error });
      }
    });
    
    return success_response({ 
      removed: results,
      errors: errors,
      total_removed: results.length,
      total_errors: errors.length
    });
  } catch (error) {
    Logger.log(`Error in bulk_remove_users: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
