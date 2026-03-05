/**
 * config.gs
 * Configuración global y funciones de ayuda para el proyecto Matcheador
 * 
 * Este archivo centraliza:
 * - Identificadores de recursos
 * - Claves de autenticación
 * - Funciones helper de uso común
 */

// ============================================
// CONSTANTES GLOBALES
// ============================================

/**
 * ID de la hoja de cálculo de Google Sheets
 * IMPORTANTE: Reemplazar con el ID real de tu spreadsheet
 */
const SPREADSHEET_ID = "1MselCSatgUeL5zKOsRVG5k_EIRpndSbT0qQuoJ7_ty8";

/**
 * Clave compartida con el backend (NestJS en Render)
 * Utilizada para autenticación servicio-a-servicio
 * IMPORTANTE: Reemplazar con una clave segura y mantenerla privada
 */
const BACKEND_KEY = "matcheador2024";

// ============================================
// FUNCIONES HELPER GLOBALES
// ============================================

/**
 * Obtiene una hoja específica por su nombre
 * 
 * @param {string} sheet_name - Nombre de la hoja a obtener
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Objeto de la hoja
 * @throws {Error} Si la hoja no existe
 */
function get_sheet_by_name(sheet_name) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(sheet_name);
    
    if (!sheet) {
      throw new Error(`Sheet "${sheet_name}" not found`);
    }
    
    return sheet;
  } catch (error) {
    Logger.log(`Error in get_sheet_by_name: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene todos los datos de una hoja como array de objetos
 * La primera fila se considera el header
 * 
 * @param {string} sheet_name - Nombre de la hoja
 * @returns {Array<Object>} Array de objetos con los datos
 */
function get_all_data_as_objects(sheet_name) {
  try {
    const sheet = get_sheet_by_name(sheet_name);
    const data = sheet.getDataRange().getValues();
    
    if (data.length === 0) {
      return [];
    }
    
    const headers = data[0];
    const rows = data.slice(1);
    
    return rows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
  } catch (error) {
    Logger.log(`Error in get_all_data_as_objects: ${error.message}`);
    return [];
  }
}

/**
 * Genera un ID único alfanumérico
 * 
 * @param {string} prefix - Prefijo opcional para el ID
 * @returns {string} ID único generado
 */
function generate_unique_id(prefix = "") {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Formatea una fecha al formato dd/mm/aaaa
 * 
 * @param {Date} date - Objeto Date a formatear
 * @returns {string} Fecha formateada
 */
function format_date(date) {
  if (!date || !(date instanceof Date)) {
    return "";
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Formatea una hora al formato hh:mm
 * 
 * @param {Date} date - Objeto Date a formatear
 * @returns {string} Hora formateada
 */
function format_time(date) {
  if (!date || !(date instanceof Date)) {
    return "";
  }
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
}

/**
 * Convierte una fecha en formato dd/mm/aaaa a objeto Date
 * 
 * @param {string} dateStr - Fecha en formato dd/mm/aaaa
 * @returns {Date|null} Objeto Date o null si es inválido
 */
function parse_date(dateStr) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Months are 0-based
  const year = parseInt(parts[2], 10);
  
  return new Date(year, month, day);
}

/**
 * Estructura de respuesta exitosa
 * 
 * @param {*} data - Datos a retornar
 * @returns {Object} Objeto de respuesta exitosa
 */
function success_response(data) {
  return {
    ok: true,
    data: data
  };
}

/**
 * Estructura de respuesta de error
 * 
 * @param {string} code - Código de error
 * @param {string} message - Mensaje de error
 * @param {Object} details - Detalles adicionales opcionales
 * @returns {Object} Objeto de respuesta de error
 */
function error_response(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code: code,
      message: message,
      details: details
    }
  };
}

/**
 * Busca el índice de una fila por el valor de una columna específica
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Hoja donde buscar
 * @param {number} columnIndex - Índice de la columna (0-based)
 * @param {*} value - Valor a buscar
 * @returns {number} Índice de la fila (1-based) o -1 si no se encuentra
 */
function find_row_index_by_column(sheet, columnIndex, value) {
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
    if (data[i][columnIndex] === value) {
      return i + 1; // Return 1-based index
    }
  }
  
  return -1;
}

/**
 * Obtiene el índice de una columna por su nombre de header
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Hoja donde buscar
 * @param {string} headerName - Nombre del header
 * @returns {number} Índice de la columna (0-based) o -1 si no se encuentra
 */
function get_column_index_by_header(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.indexOf(headerName);
}
