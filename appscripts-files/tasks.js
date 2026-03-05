/**
 * tasks.gs
 * API de Apps Script para la entidad Tareas
 * 
 * Esquema de la hoja tasks:
 * - task_id (alfanumérico)
 * - user_id (numérico)
 * - user_name (string)
 * - user_team (string)
 * - task_name (string)
 * - task_link (string)
 * - task_notes (string)
 * - assigned_at (date object - dd/mm/aaaa)
 * - assigned_by (numérico)
 */

const TASKS_SHEET_NAME = "tasks";

/**
 * Crea una nueva tarea para un usuario
 * 
 * @param {number} user_id - ID del usuario
 * @param {Object} taskData - Datos de la tarea
 * @returns {Object} Respuesta con el task_id creado o error
 */
function set_new_task(user_id, taskData) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Generar un task_id único
    const task_id = generate_unique_id("TASK");
    
    // Fecha de asignación actual
    const assigned_at = format_date(new Date());
    
    // Preparar la nueva fila
    const newRow = [];
    headers.forEach(header => {
      if (header === "task_id") {
        newRow.push(task_id);
      } else if (header === "user_id") {
        newRow.push(user_id);
      } else if (header === "assigned_at") {
        newRow.push(assigned_at);
      } else {
        newRow.push(taskData[header] || "");
      }
    });
    
    // Agregar la fila
    sheet.appendRow(newRow);
    
    return success_response({ task_id: task_id });
  } catch (error) {
    Logger.log(`Error in set_new_task: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Crea múltiples tareas de forma masiva
 * 
 * @param {Array} tasksArray - Array de objetos con datos de tareas
 * @returns {Object} Respuesta con los task_ids creados o error
 */
function set_multiple_task(tasksArray) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const assigned_at = format_date(new Date());
    const createdIds = [];
    
    // Preparar todas las filas
    const newRows = [];
    
    tasksArray.forEach(taskData => {
      const task_id = generate_unique_id("TASK");
      createdIds.push(task_id);
      
      const newRow = [];
      headers.forEach(header => {
        if (header === "task_id") {
          newRow.push(task_id);
        } else if (header === "assigned_at") {
          newRow.push(assigned_at);
        } else {
          newRow.push(taskData[header] || "");
        }
      });
      
      newRows.push(newRow);
    });
    
    // Agregar todas las filas de una vez (más eficiente)
    if (newRows.length > 0) {
      const lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, headers.length).setValues(newRows);
    }
    
    return success_response({ 
      task_ids: createdIds,
      count: createdIds.length 
    });
  } catch (error) {
    Logger.log(`Error in set_multiple_task: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene todas las tareas
 * 
 * @returns {Object} Respuesta con array de tareas o error
 */
function get_all_tasks() {
  try {
    const tasks = get_all_data_as_objects(TASKS_SHEET_NAME);
    return success_response(tasks);
  } catch (error) {
    Logger.log(`Error in get_all_tasks: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene tareas de un usuario específico
 * 
 * @param {number} user_id - ID del usuario
 * @returns {Object} Respuesta con array de tareas o error
 */
function get_tasks_by_user(user_id) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const tasks = [];
    const userIdIndex = headers.indexOf("user_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][userIdIndex] === user_id) {
        const task = {};
        headers.forEach((header, index) => {
          task[header] = data[i][index];
        });
        tasks.push(task);
      }
    }
    
    return success_response(tasks);
  } catch (error) {
    Logger.log(`Error in get_tasks_by_user: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene tareas de un equipo específico
 * 
 * @param {string} user_team - Nombre del equipo
 * @returns {Object} Respuesta con array de tareas o error
 */
function get_tasks_by_team(user_team) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const tasks = [];
    const teamIndex = headers.indexOf("user_team");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][teamIndex] === user_team) {
        const task = {};
        headers.forEach((header, index) => {
          task[header] = data[i][index];
        });
        tasks.push(task);
      }
    }
    
    return success_response(tasks);
  } catch (error) {
    Logger.log(`Error in get_tasks_by_team: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene tareas de los usuarios de un líder específico
 * 
 * @param {number} user_leader - ID del líder
 * @returns {Object} Respuesta con array de tareas o error
 */
function get_tasks_by_leader(user_leader) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const tasks = [];
    const assignedByIndex = headers.indexOf("assigned_by");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][assignedByIndex] === user_leader) {
        const task = {};
        headers.forEach((header, index) => {
          task[header] = data[i][index];
        });
        tasks.push(task);
      }
    }
    
    return success_response(tasks);
  } catch (error) {
    Logger.log(`Error in get_tasks_by_leader: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Obtiene una tarea por su ID
 * 
 * @param {string} task_id - ID de la tarea
 * @returns {Object} Respuesta con la tarea o error
 */
function get_task_by_id(task_id) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const taskIdIndex = headers.indexOf("task_id");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][taskIdIndex] === task_id) {
        const task = {};
        headers.forEach((header, index) => {
          task[header] = data[i][index];
        });
        return success_response(task);
      }
    }
    
    return error_response("TASK_NOT_FOUND", "Task not found", { task_id: task_id });
  } catch (error) {
    Logger.log(`Error in get_task_by_id: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Modifica una tarea existente
 * 
 * @param {string} task_id - ID de la tarea
 * @param {Object} taskData - Datos a actualizar
 * @returns {Object} Respuesta con éxito o error
 */
function modify_task(task_id, taskData) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const taskIdIndex = headers.indexOf("task_id");
    
    // Buscar la tarea
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][taskIdIndex] === task_id) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex === -1) {
      return error_response("TASK_NOT_FOUND", "Task not found", { task_id: task_id });
    }
    
    // Actualizar los campos
    headers.forEach((header, index) => {
      if (taskData.hasOwnProperty(header) && header !== "task_id") {
        sheet.getRange(rowIndex, index + 1).setValue(taskData[header]);
      }
    });
    
    return success_response({ task_id: task_id, updated: true });
  } catch (error) {
    Logger.log(`Error in modify_task: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}

/**
 * Elimina una o más tareas de forma permanente
 * 
 * @param {Array} task_ids - Array de IDs de tareas a eliminar
 * @returns {Object} Respuesta con éxito o error
 */
function delete_task(task_ids) {
  try {
    const sheet = get_sheet_by_name(TASKS_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const taskIdIndex = headers.indexOf("task_id");
    const deletedIds = [];
    
    // Encontrar y eliminar filas en orden inverso (para no afectar índices)
    for (let i = data.length - 1; i >= 1; i--) {
      if (task_ids.includes(data[i][taskIdIndex])) {
        sheet.deleteRow(i + 1);
        deletedIds.push(data[i][taskIdIndex]);
      }
    }
    
    return success_response({ 
      deleted_task_ids: deletedIds,
      count: deletedIds.length 
    });
  } catch (error) {
    Logger.log(`Error in delete_task: ${error.message}`);
    return error_response("INTERNAL_ERROR", error.message);
  }
}
