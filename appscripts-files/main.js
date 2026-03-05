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

    const functionName = body.function;
    const parameters = body.parameters || [];

    // Verificar que la función existe
    if (!functionName) {
      return buildResponse({ ok: false, error: { code: 'BAD_REQUEST', message: 'Function name required' } });
    }

    // Llamar a la función dinámicamente
    const fn = this[functionName];
    if (typeof fn !== 'function') {
      return buildResponse({ ok: false, error: { code: 'NOT_FOUND', message: `Function ${functionName} not found` } });
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