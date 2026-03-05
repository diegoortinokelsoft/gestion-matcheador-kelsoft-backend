/**
 * initiatives.gs
 * API de Apps Script para la entidad Iniciativas
 * 
 * Esquema de la hoja initiatives:
 * - initiative_id (string)
 * - initiative_status (string: DRAFT, ACTIVE, PAUSED, DONE, ARCHIVED)
 * - initiative_name (string)
 * - initiative_task_type (string: TAG, SEARCH, OTHER)
 * - initiative_task_count_target (number)
 * - initiative_insumo_url (string)
 * - initiative_workplace_url (string)
 * - initiative_notes (string)
 * - initiative_owner_user_id (number)
 * - created_at (string - dd/mm/aaaa)
 * - updated_at (string - dd/mm/aaaa)
 * - updated_by (number)
 * - version (number)
 */

const INITIATIVES_SHEET_NAME = "initiatives";

/**
 * Obtiene una iniciativa por su ID
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @returns {Object} Respuesta con la iniciativa o error
 */
function get_initiative_by_id(initiative_id) {
  try {
    const sheet = get_sheet_by_name(INITIATIVES_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiativeIdIndex = headers.indexOf("initiative_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][initiativeIdIndex] === initiative_id) {
        const initiative = {};
        headers.forEach((header, index) => {
          initiative[header] = data[i][index];
        });
        return success_response(initiative);
      }
    }
    
    return error_response("INITIATIVE_NOT_FOUND", "Initiative not found", { initiative_id: initiative_id });
  } catch (error) {
    Logger.log(`Error in get_initiative_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Lista iniciativas con filtros opcionales
 * 
 * @param {Object} filters - Filtros opcionales (status, owner_user_id, etc.)
 * @returns {Object} Respuesta con array de iniciativas o error
 */
function list_initiatives(filters = {}) {
  try {
    const sheet = get_sheet_by_name(INITIATIVES_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiatives = [];
    
    for (let i = 1; i < data.length; i++) {
      const initiative = {};
      headers.forEach((header, index) => {
        initiative[header] = data[i][index];
      });
      
      // Aplicar filtros
      let matchesFilters = true;
      
      if (filters.status && initiative.initiative_status !== filters.status) {
        matchesFilters = false;
      }
      
      if (filters.owner_user_id && initiative.initiative_owner_user_id !== filters.owner_user_id) {
        matchesFilters = false;
      }
      
      if (filters.task_type && initiative.initiative_task_type !== filters.task_type) {
        matchesFilters = false;
      }
      
      if (matchesFilters) {
        initiatives.push(initiative);
      }
    }
    
    return success_response(initiatives);
  } catch (error) {
    Logger.log(`Error in list_initiatives: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Crea una nueva iniciativa
 * 
 * @param {Object} initiativeData - Datos de la nueva iniciativa
 * @returns {Object} Respuesta con el initiative_id creado o error
 */
function create_initiative(initiativeData) {
  try {
    const sheet = get_sheet_by_name(INITIATIVES_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Generar un initiative_id único
    const initiative_id = generate_unique_id("INIT");
    
    const now = format_date(new Date());
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "initiative_id") {
        newRow.push(initiative_id);
      } else if (header === "initiative_status") {
        newRow.push(initiativeData.initiative_status || "DRAFT");
      } else if (header === "created_at") {
        newRow.push(now);
      } else if (header === "updated_at") {
        newRow.push(now);
      } else if (header === "version") {
        newRow.push(1);
      } else {
        newRow.push(initiativeData[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ initiative_id: initiative_id });
  } catch (error) {
    Logger.log(`Error in create_initiative: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Actualiza campos específicos de una iniciativa
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {Object} patchData - Campos a actualizar
 * @param {number} updatedBy - ID del usuario que realiza la actualización
 * @returns {Object} Respuesta con éxito o error
 */
function update_initiative(initiative_id, patchData, updatedBy) {
  try {
    const sheet = get_sheet_by_name(INITIATIVES_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const initiativeIdIndex = headers.indexOf("initiative_id");
    const versionIndex = headers.indexOf("version");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    
    // Buscar la iniciativa
    let rowIndex = -1;
    let currentVersion = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][initiativeIdIndex] === initiative_id) {
        rowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("INITIATIVE_NOT_FOUND", "Initiative not found", { initiative_id: initiative_id });
    }
    
    // Actualizar los campos
    headers.forEach((header, index) => {
      if (patchData.hasOwnProperty(header) && header !== "initiative_id" && header !== "version") {
        sheet.getRange(rowIndex, index + 1).setValue(patchData[header]);
      }
    });
    
    // Incrementar versión
    sheet.getRange(rowIndex, versionIndex + 1).setValue(currentVersion + 1);
    
    // Actualizar metadatos
    sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(format_date(new Date()));
    sheet.getRange(rowIndex, updatedByIndex + 1).setValue(updatedBy);
    
    return success_response({ 
      initiative_id: initiative_id, 
      updated: true,
      version: currentVersion + 1
    });
  } catch (error) {
    Logger.log(`Error in update_initiative: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Modifica únicamente el estado de una iniciativa
 * 
 * @param {string} initiative_id - ID de la iniciativa
 * @param {string} status - Nuevo estado (DRAFT, ACTIVE, PAUSED, DONE, ARCHIVED)
 * @param {number} updatedBy - ID del usuario que realiza la actualización
 * @returns {Object} Respuesta con éxito o error
 */
function set_initiative_status(initiative_id, status, updatedBy) {
  try {
    const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "DONE", "ARCHIVED"];
    
    if (!validStatuses.includes(status)) {
      return error_response("INVALID_STATUS", "Invalid status value", { 
        provided: status, 
        valid: validStatuses 
      });
    }
    
    return update_initiative(initiative_id, { initiative_status: status }, updatedBy);
  } catch (error) {
    Logger.log(`Error in set_initiative_status: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
