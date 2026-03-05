/**
 * main.gs
 * Router principal - recibe todos los requests del backend NestJS
 */

function doPost(e) {
  try {
    // Verificar BACKEND_KEY
    const body = JSON.parse(e.postData.contents);
    const key = e.parameter.key || body.key || '';
    
    if (key !== BACKEND_KEY) {
      return buildResponse({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid key' } });
    }

    const actionName = body.action || body.function;
    const paramsPayload = body.params;
    let parameters = [];

    if (Array.isArray(body.parameters)) {
      parameters = body.parameters;
    } else if (Array.isArray(paramsPayload)) {
      parameters = paramsPayload;
    } else if (paramsPayload != null) {
      parameters = [paramsPayload];
    }

    // Verificar que la función existe
    if (!actionName) {
      return buildResponse({ ok: false, error: { code: 'BAD_REQUEST', message: 'Action name required' } });
    }

    // Llamar a la función dinámicamente
    const fn = this[actionName];
    if (typeof fn !== 'function') {
      return buildResponse({ ok: false, error: { code: 'NOT_FOUND', message: `Function ${actionName} not found` } });
    }

    const result = fn(...parameters);
    return buildResponse(result);

  } catch (error) {
    Logger.log('doPost error: ' + error.message);
    return buildResponse({ ok: false, error: { code: 'INTERNAL_ERROR', message: error.message } });
  }
}

function doGet(e) {
  return buildResponse({ ok: true, data: { message: 'Matcheador API running' } });
}

function buildResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
