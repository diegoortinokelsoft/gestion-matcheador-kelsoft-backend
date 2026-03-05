/**
 * WebApp.gs
 * Manejador de peticiones HTTP para la Web App de Apps Script
 * 
 * IMPORTANTE: 
 * para que el backend pueda comunicarse con la capa de datos.
 */

/**
 * Maneja peticiones POST desde el backend
 * La autenticación se hace via query parameter 'key'
 */
function doPost(e) {
  try {
    // Leer la clave de autenticación del query parameter
    const params = e.parameter || {};
    const providedKey = params.key;
    
    // Verificar autenticación
    if (providedKey !== BACKEND_KEY) {
      Logger.log(`Unauthorized access attempt. Provided key: ${providedKey ? 'present but invalid' : 'missing'}`);
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing backend key'
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Parsear el body de la petición
    const requestBody = JSON.parse(e.postData.contents);
    const actionName = requestBody.action || requestBody.function;
    const paramsPayload = requestBody.params && typeof requestBody.params === 'object'
      ? requestBody.params
      : null;
    const parameters = Array.isArray(requestBody.parameters) ? requestBody.parameters : [];

    if (!actionName) {
      return ContentService
        .createTextOutput(JSON.stringify(error_response('BAD_REQUEST', 'Action name required')))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log(`Executing action: ${actionName} with ${parameters.length} legacy parameters`);
    
    // Ejecutar la función solicitada
    let result;
    
    switch(actionName) {
      // ========================================
      // USERS
      // ========================================
      case 'get_user_by_id':
        result = get_user_by_id(parameters[0]);
        break;
      case 'get_all_users':
        result = get_all_users();
        break;
      case 'get_users_by_leader_id':
        result = get_users_by_leader_id(parameters[0]);
        break;
      case 'get_users_by_team':
        result = get_users_by_team(parameters[0]);
        break;
      case 'get_users_by_status':
        result = get_users_by_status(parameters[0]);
        break;
      case 'get_users_by_role':
        result = get_users_by_role(parameters[0]);
        break;
      case 'set_new_user':
        result = set_new_user(parameters[0]);
        break;
      case 'modify_user':
        result = modify_user(parameters[0], parameters[1]);
        break;
      case 'disable_or_allow_user':
        result = disable_or_allow_user(parameters[0]);
        break;
        
      // ========================================
      // PASSWORDS
      // ========================================
      case 'get_login_data':
        result = get_login_data();
        break;
      case 'reset_user_password':
        result = reset_user_password(parameters[0], parameters[1]);
        break;
      case 'update_user_password':
        result = update_user_password(parameters[0], parameters[1]);
        break;
      case 'create_user_password':
        result = create_user_password(parameters[0], parameters[1], parameters[2], parameters[3]);
        break;
      case 'get_user_password_hash':
        result = get_user_password_hash(parameters[0]);
        break;
        
      // ========================================
      // LOGS
      // ========================================
      case 'set_new_log':
        result = set_new_log(parameters[0], parameters[1]);
        break;
      case 'get_all_logs':
        result = get_all_logs();
        break;
      case 'get_logs_by_user':
        result = get_logs_by_user(parameters[0]);
        break;
      case 'get_logs_by_team':
        result = get_logs_by_team(parameters[0]);
        break;
      case 'get_logs_by_leader':
        result = get_logs_by_leader(parameters[0]);
        break;
      case 'get_log_by_id':
        result = get_log_by_id(parameters[0]);
        break;
      case 'get_logs_by_date':
        result = get_logs_by_date(parameters[0]);
        break;
        
      // ========================================
      // VACATIONS
      // ========================================
      case 'set_new_vacation':
        result = set_new_vacation(parameters[0], parameters[1]);
        break;
      case 'approve_vacation ':
        result = approve_vacation (parameters[0]);
        break;
      case 'deny_vacation':
        result = deny_vacation(parameters[0]);
        break;
      case 'get_all_vacations':
        result = get_all_vacations();
        break;
      case 'get_vacations_by_user':
        result = get_vacations_by_user(parameters[0]);
        break;
      case 'get_vacations_by_team':
        result = get_vacations_by_team(parameters[0]);
        break;
      case 'get_vacations_by_leader':
        result = get_vacations_by_leader(parameters[0]);
        break;
      case 'get_vacation_by_id':
        result = get_vacation_by_id(parameters[0]);
        break;
        
      // ========================================
      // TASKS
      // ========================================
      case 'set_new_task':
        result = set_new_task(parameters[0], parameters[1]);
        break;
      case 'set_multiple_task':
        result = set_multiple_task(parameters[0]);
        break;
      case 'get_all_tasks':
        result = get_all_tasks();
        break;
      case 'get_tasks_by_user':
        result = get_tasks_by_user(parameters[0]);
        break;
      case 'get_tasks_by_team':
        result = get_tasks_by_team(parameters[0]);
        break;
      case 'get_tasks_by_leader':
        result = get_tasks_by_leader(parameters[0]);
        break;
      case 'get_task_by_id':
        result = get_task_by_id(parameters[0]);
        break;
      case 'modify_task':
        result = modify_task(parameters[0], parameters[1]);
        break;
      case 'delete_task':
        result = delete_task(parameters[0]);
        break;
        
      // ========================================
      // INITIATIVES
      // ========================================
      case 'get_initiative_by_id':
        result = get_initiative_by_id(parameters[0]);
        break;
      case 'list_initiatives':
        result = list_initiatives(parameters[0]);
        break;
      case 'create_initiative':
        result = create_initiative(parameters[0]);
        break;
      case 'update_initiative':
        result = update_initiative(parameters[0], parameters[1], parameters[2]);
        break;
      case 'set_initiative_status':
        result = set_initiative_status(parameters[0], parameters[1], parameters[2]);
        break;
        
      // ========================================
      // INITIATIVE MEMBERS
      // ========================================
      case 'list_members_by_initiative':
        result = list_members_by_initiative(parameters[0], parameters[1]);
        break;
      case 'list_initiatives_by_user':
        result = list_initiatives_by_user(parameters[0], parameters[1]);
        break;
      case 'assign_user_to_initiative':
        result = assign_user_to_initiative(parameters[0], parameters[1], parameters[2]);
        break;
      case 'remove_user_from_initiative':
        result = remove_user_from_initiative(parameters[0], parameters[1], parameters[2]);
        break;
      case 'bulk_assign_users':
        result = bulk_assign_users(parameters[0], parameters[1], parameters[2]);
        break;
      case 'bulk_remove_users':
        result = bulk_remove_users(parameters[0], parameters[1], parameters[2]);
        break;
        
      // ========================================
      // WORK SESSIONS
      // ========================================
      case 'create_session':
        result = create_session(paramsPayload || parameters[0]);
        break;
      case 'get_session_by_id':
        result = get_session_by_id(paramsPayload || parameters[0]);
        break;
      case 'get_session_by_user_and_date':
        result = get_session_by_user_and_date(paramsPayload || parameters[0]);
        break;
      case 'get_open_session_by_user_and_date':
        result = get_session_by_user_and_date(
          paramsPayload || {
            user_id: parameters[0],
            session_date: parameters[1],
          },
        );
        break;
      case 'list_sessions':
        result = list_sessions(paramsPayload || parameters[0]);
        break;
      case 'update_session':
        result = update_session(paramsPayload || parameters[0]);
        break;
      case 'delete_session':
        result = delete_session(paramsPayload || parameters[0]);
        break;
      case 'close_session':
        result = update_session(
          paramsPayload || {
            session_id: parameters[0],
            patch: parameters[1],
          },
        );
        break;
        
      // ========================================
      // WORK SESSION ITEMS
      // ========================================
      case 'create_item':
        result = create_item(paramsPayload || parameters[0]);
        break;
      case 'get_item_by_id':
        result = get_item_by_id(paramsPayload || parameters[0]);
        break;
      case 'get_item_by_session_and_initiative':
        result = get_item_by_session_and_initiative(paramsPayload || parameters[0]);
        break;
      case 'upsert_session_item':
        result = upsert_session_item(parameters[0], parameters[1], parameters[2], parameters[3]);
        break;
      case 'list_items_by_session':
        result = list_items_by_session(
          paramsPayload || (typeof parameters[0] === 'object' ? parameters[0] : { session_id: parameters[0] }),
        );
        break;
      case 'list_items_by_user_and_date':
        result = list_items_by_user_and_date(
          paramsPayload || {
            user_id: parameters[0],
            session_date: parameters[1],
          },
        );
        break;
      case 'update_item':
        result = update_item(paramsPayload || parameters[0]);
        break;
      case 'update_session_item':
        result = update_session_item(parameters[0], parameters[1], parameters[2]);
        break;
      case 'delete_item':
        result = delete_item(paramsPayload || parameters[0]);
        break;
      case 'delete_session_item':
        result = delete_session_item(parameters[0]);
        break;
        
      default:
        Logger.log(`Action not found: ${actionName}`);
        result = error_response('FUNCTION_NOT_FOUND', `Function ${actionName} not found`);
    }
    
    // Log de éxito
    if (result.ok) {
      Logger.log(`Action ${actionName} executed successfully`);
    } else {
      Logger.log(`Action ${actionName} returned error: ${JSON.stringify(result.error)}`);
    }
    
    // Retornar el resultado
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log(`ERROR in doPost: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message,
          details: {
            stack: error.stack
          }
        }
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Maneja peticiones GET (para testing)
 * Útil para verificar que la Web App está funcionando
 */
function doGet(e) {
  const params = e.parameter || {};
  const providedKey = params.key;
  
  // Si se proporciona la clave correcta, mostrar info del sistema
  if (providedKey === BACKEND_KEY) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        message: 'Apps Script Web App is running',
        timestamp: new Date().toISOString(),
        spreadsheetId: SPREADSHEET_ID,
        version: '1.0.0'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Sin clave o clave incorrecta, respuesta genérica
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      message: 'Apps Script Web App is active',
      timestamp: new Date().toISOString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función de testing para verificar conectividad
 * Llama a esta función desde el backend para probar la conexión
 */
function ping() {
  return success_response({
    message: 'pong',
    timestamp: new Date().toISOString()
  });
}
