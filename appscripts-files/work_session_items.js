/**
 * work_session_items.gs
 * API de Apps Script para el detalle de jornadas por iniciativa
 * 
 * Esquema de la hoja work_session_items:
 * - item_id (string)
 * - session_id (string)
 * - user_id (number)
 * - session_date (date object - dd/mm/aaaa)
 * - initiative_id (string)
 * - initiative_name (string)
 * - task_type (string: TAG, SEARCH, OTHER)
 * - tasks_done_count (number)
 * - target_task_count (number)
 * - is_target_met (boolean - valor derivado)
 * - notes (string)
 * - created_at (string - dd/mm/aaaa)
 * - updated_at (string - dd/mm/aaaa)
 * - updated_by (number)
 * - version (number)
 * 
 * Regla de unicidad: (session_id + initiative_id)
 */

const WORK_SESSION_ITEMS_SHEET_NAME = "work_session_items";

/**
 * Crea o actualiza un registro de iniciativa dentro de una jornada (upsert)
 * Si existe, incrementa tasks_done_count; si no, crea nuevo registro
 * 
 * @param {string} session_id - ID de la jornada
 * @param {string} initiative_id - ID de la iniciativa
 * @param {number} deltaTasks - Cantidad de tareas a agregar al contador
 * @param {Object} patchData - Datos adicionales opcionales
 * @returns {Object} Respuesta con éxito o error
 */
function upsert_session_item(session_id, initiative_id, deltaTasks, patchData = {}) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSION_ITEMS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const sessionIdIndex = headers.indexOf("session_id");
    const initiativeIdIndex = headers.indexOf("initiative_id");
    const tasksCountIndex = headers.indexOf("tasks_done_count");
    const versionIndex = headers.indexOf("version");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    
    // Buscar si ya existe el registro
    let existingRowIndex = -1;
    let currentTasksCount = 0;
    let currentVersion = 0;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][sessionIdIndex] === session_id && data[i][initiativeIdIndex] === initiative_id) {
        existingRowIndex = i + 1;
        currentTasksCount = data[i][tasksCountIndex] || 0;
        currentVersion = data[i][versionIndex] || 0;
        break;
      }
    }
    
    const now = format_date(new Date());
    
    if (existingRowIndex !== -1) {
      // Actualizar registro existente
      const newTasksCount = currentTasksCount + deltaTasks;
      sheet.getRange(existingRowIndex, tasksCountIndex + 1).setValue(newTasksCount);
      
      // Actualizar otros campos si se proporcionan
      headers.forEach((header, index) => {
        if (patchData.hasOwnProperty(header) && header !== "item_id" && header !== "session_id" && header !== "initiative_id") {
          sheet.getRange(existingRowIndex, index + 1).setValue(patchData[header]);
        }
      });
      
      // Incrementar versión y actualizar metadatos
      sheet.getRange(existingRowIndex, versionIndex + 1).setValue(currentVersion + 1);
      sheet.getRange(existingRowIndex, updatedAtIndex + 1).setValue(now);
      if (patchData.updated_by) {
        sheet.getRange(existingRowIndex, updatedByIndex + 1).setValue(patchData.updated_by);
      }
      
      return success_response({ 
        item_id: data[existingRowIndex - 1][headers.indexOf("item_id")],
        action: "updated",
        tasks_done_count: newTasksCount
      });
    } else {
      // Crear nuevo registro
      const item_id = generate_unique_id("ITEM");
      
      const newRow = [];
      headers.forEach(header => {
        if (header === "item_id") {
          newRow.push(item_id);
        } else if (header === "session_id") {
          newRow.push(session_id);
        } else if (header === "initiative_id") {
          newRow.push(initiative_id);
        } else if (header === "tasks_done_count") {
          newRow.push(deltaTasks);
        } else if (header === "created_at") {
          newRow.push(now);
        } else if (header === "updated_at") {
          newRow.push(now);
        } else if (header === "version") {
          newRow.push(1);
        } else if (header === "is_target_met") {
          newRow.push(false);
        } else {
          newRow.push(patchData[header] || "");
        }
      });
      
      sheet.appendRow(newRow);
      
      return success_response({ 
        item_id: item_id,
        action: "created",
        tasks_done_count: deltaTasks
      });
    }
  } catch (error) {
    Logger.log(`Error in upsert_session_item: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Lista todas las iniciativas trabajadas en una jornada
 * 
 * @param {string} session_id - ID de la jornada
 * @returns {Object} Respuesta con array de items o error
 */
function list_items_by_session(session_id) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSION_ITEMS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const items = [];
    const sessionIdIndex = headers.indexOf("session_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][sessionIdIndex] === session_id) {
        const item = {};
        headers.forEach((header, index) => {
          item[header] = data[i][index];
        });
        items.push(item);
      }
    }
    
    return success_response(items);
  } catch (error) {
    Logger.log(`Error in list_items_by_session: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Lista el detalle de actividad de un usuario en una fecha específica
 * 
 * @param {number} user_id - ID del usuario
 * @param {string} session_date - Fecha en formato dd/mm/aaaa
 * @returns {Object} Respuesta con array de items o error
 */
function list_items_by_user_and_date(user_id, session_date) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSION_ITEMS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const items = [];
    const userIdIndex = headers.indexOf("user_id");
    const sessionDateIndex = headers.indexOf("session_date");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id && data[i][sessionDateIndex] === session_date) {
        const item = {};
        headers.forEach((header, index) => {
          item[header] = data[i][index];
        });
        items.push(item);
      }
    }
    
    return success_response(items);
  } catch (error) {
    Logger.log(`Error in list_items_by_user_and_date: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Actualiza un registro de item existente
 * 
 * @param {string} item_id - ID del item
 * @param {Object} patch_data - Campos a actualizar
 * @param {number} updated_by - ID del usuario que realiza la actualización
 * @returns {Object} Respuesta con éxito o error
 */
function update_session_item(item_id, patch_data, updated_by) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSION_ITEMS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const itemIdIndex = headers.indexOf("item_id");
    const versionIndex = headers.indexOf("version");
    const updatedAtIndex = headers.indexOf("updated_at");
    const updatedByIndex = headers.indexOf("updated_by");
    
    // Buscar el item
    let rowIndex = -1;
    let currentVersion = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i][itemIdIndex] === item_id) {
        rowIndex = i + 1;
        currentVersion = data[i][versionIndex];
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("ITEM_NOT_FOUND", "Session item not found", { item_id: item_id });
    }
    
    // Actualizar los campos
    headers.forEach((header, index) => {
      if (patch_data.hasOwnProperty(header) && header !== "item_id" && header !== "version") {
        sheet.getRange(rowIndex, index + 1).setValue(patch_data[header]);
      }
    });
    
    // Incrementar versión
    sheet.getRange(rowIndex, versionIndex + 1).setValue(currentVersion + 1);
    
    // Actualizar metadatos
    sheet.getRange(rowIndex, updatedAtIndex + 1).setValue(format_date(new Date()));
    sheet.getRange(rowIndex, updatedByIndex + 1).setValue(updated_by);
    
    return success_response({ 
      item_id: item_id, 
      updated: true,
      version: currentVersion + 1
    });
  } catch (error) {
    Logger.log(`Error in update_session_item: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Elimina un registro de item (uso excepcional)
 * 
 * @param {string} item_id - ID del item a eliminar
 * @returns {Object} Respuesta con éxito o error
 */
function delete_session_item(item_id) {
  try {
    const sheet = get_sheet_by_name(WORK_SESSION_ITEMS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const itemIdIndex = headers.indexOf("item_id");
    
    // Buscar y eliminar el item
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][itemIdIndex] === item_id) {
        sheet.deleteRow(i + 1);
        return success_response({ 
          item_id: item_id,
          deleted: true
        });
      }
    }
    
    return error_response("ITEM_NOT_FOUND", "Session item not found", { item_id: item_id });
  } catch (error) {
    Logger.log(`Error in delete_session_item: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
