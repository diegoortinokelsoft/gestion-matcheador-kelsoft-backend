/**
 * work_session_items.gs
 * Data access for work_session_items.
 *
 * Rules:
 * - No business logic
 * - Last write wins
 * - No version checks
 * - update_* only overwrites existing columns
 */

const WORK_SESSION_ITEMS_SHEET_NAME = 'work_session_items';

function create_item(params) {
  try {
    const payload = wsiAsObjectOrNull_(params);
    if (!payload) {
      return wsiBadRequest_('params must be an object');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const createdAt = payload.created_at || wsiNowStr_();

    const row = headers.map(function (header) {
      if (Object.prototype.hasOwnProperty.call(payload, header)) {
        return payload[header];
      }
      if (header === 'item_id') {
        return wsiGenerateId_();
      }
      if (header === 'created_at') {
        return createdAt;
      }
      if (header === 'updated_at') {
        return payload.updated_at || createdAt;
      }
      return '';
    });

    sheet.appendRow(row);
    return success_response(wsiReadRowAsObject_(sheet, sheet.getLastRow()));
  } catch (error) {
    return wsiInternalError_('create_item', error);
  }
}

function get_item_by_id(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || { item_id: params };
    const itemId = payload ? payload.item_id : null;
    if (!itemId) {
      return wsiBadRequest_('item_id is required');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rowIndex = wsiFindRowByValue_(sheet, 'item_id', itemId);
    if (rowIndex === -1) {
      return success_response(null);
    }

    return success_response(wsiReadRowAsObject_(sheet, rowIndex));
  } catch (error) {
    return wsiInternalError_('get_item_by_id', error);
  }
}

function list_items_by_session(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || { session_id: params };
    const sessionId = payload ? payload.session_id : null;
    if (!sessionId) {
      return wsiBadRequest_('session_id is required');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rows = wsiReadAllRowsAsObjects_(sheet);
    const filtered = rows.filter(function (row) {
      return wsiSameValue_(row.session_id, sessionId);
    });

    return success_response(filtered);
  } catch (error) {
    return wsiInternalError_('list_items_by_session', error);
  }
}

function list_items_by_user_and_date(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || {
      user_id: params,
      session_date: arguments.length >= 2 ? arguments[1] : null,
    };
    if (!payload) {
      return wsiBadRequest_('params must be an object');
    }

    if (payload.user_id == null || !payload.session_date) {
      return wsiBadRequest_('user_id and session_date are required');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rows = wsiReadAllRowsAsObjects_(sheet);
    const filtered = rows.filter(function (row) {
      return (
        wsiSameValue_(row.user_id, payload.user_id) &&
        wsiSameValue_(row.session_date, payload.session_date)
      );
    });

    return success_response(filtered);
  } catch (error) {
    return wsiInternalError_('list_items_by_user_and_date', error);
  }
}

function get_item_by_session_and_initiative(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || {
      session_id: params,
      initiative_id: arguments.length >= 2 ? arguments[1] : null,
    };
    if (!payload) {
      return wsiBadRequest_('params must be an object');
    }

    if (!payload.session_id || !payload.initiative_id) {
      return wsiBadRequest_('session_id and initiative_id are required');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rows = wsiReadAllRowsAsObjects_(sheet);

    for (let i = 0; i < rows.length; i += 1) {
      if (
        wsiSameValue_(rows[i].session_id, payload.session_id) &&
        wsiSameValue_(rows[i].initiative_id, payload.initiative_id)
      ) {
        return success_response(rows[i]);
      }
    }

    return success_response(null);
  } catch (error) {
    return wsiInternalError_('get_item_by_session_and_initiative', error);
  }
}

function update_item(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || {
      item_id: params,
      patch: arguments.length >= 2 ? arguments[1] : null,
    };
    if (!payload) {
      return wsiBadRequest_('params must be an object');
    }

    const itemId = payload.item_id;
    const patch = wsiAsObjectOrNull_(payload.patch);
    if (!itemId) {
      return wsiBadRequest_('item_id is required');
    }
    if (!patch) {
      return wsiBadRequest_('patch must be an object');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rowIndex = wsiFindRowByValue_(sheet, 'item_id', itemId);
    if (rowIndex === -1) {
      return wsiNotFound_('Item not found', { item_id: itemId });
    }

    wsiUpdateRow_(sheet, rowIndex, patch);
    return success_response(wsiReadRowAsObject_(sheet, rowIndex));
  } catch (error) {
    return wsiInternalError_('update_item', error);
  }
}

function delete_item(params) {
  try {
    const payload = wsiAsObjectOrNull_(params) || { item_id: params };
    const itemId = payload ? payload.item_id : null;
    if (!itemId) {
      return wsiBadRequest_('item_id is required');
    }

    const sheet = wsiGetSheet_(WORK_SESSION_ITEMS_SHEET_NAME);
    const rowIndex = wsiFindRowByValue_(sheet, 'item_id', itemId);
    if (rowIndex === -1) {
      return wsiNotFound_('Item not found', { item_id: itemId });
    }

    sheet.deleteRow(rowIndex);
    return success_response({ item_id: itemId, deleted: true });
  } catch (error) {
    return wsiInternalError_('delete_item', error);
  }
}

function upsert_session_item(session_id, initiative_id, deltaTasks, patchData) {
  try {
    const existingResult = get_item_by_session_and_initiative({
      session_id: session_id,
      initiative_id: initiative_id,
    });

    if (!existingResult.ok) {
      return existingResult;
    }

    const existing = existingResult.data;
    const patch = wsiAsObjectOrNull_(patchData) || {};
    const delta = Number(deltaTasks);
    const safeDelta = Number.isFinite(delta) ? delta : undefined;

    if (existing && existing.item_id) {
      const updatePatch = Object.assign({}, patch);
      if (safeDelta !== undefined && !Object.prototype.hasOwnProperty.call(updatePatch, 'tasks_done_count')) {
        updatePatch.tasks_done_count = safeDelta;
      }
      return update_item({
        item_id: existing.item_id,
        patch: updatePatch,
      });
    }

    const createPayload = Object.assign({}, patch, {
      item_id: patch.item_id || wsiGenerateId_(),
      session_id: session_id,
      initiative_id: initiative_id,
    });
    if (safeDelta !== undefined && !Object.prototype.hasOwnProperty.call(createPayload, 'tasks_done_count')) {
      createPayload.tasks_done_count = safeDelta;
    }
    return create_item(createPayload);
  } catch (error) {
    return wsiInternalError_('upsert_session_item', error);
  }
}

function update_session_item(item_id, patch_data, updated_by) {
  const patch = wsiAsObjectOrNull_(patch_data) || {};
  if (updated_by != null && !Object.prototype.hasOwnProperty.call(patch, 'updated_by')) {
    patch.updated_by = updated_by;
  }
  return update_item({
    item_id: item_id,
    patch: patch,
  });
}

function delete_session_item(item_id) {
  return delete_item({ item_id: item_id });
}

function wsiGetSheet_(sheetName) {
  if (typeof getSheet_ === 'function') {
    return getSheet_(sheetName);
  }
  if (typeof get_sheet_by_name === 'function') {
    return get_sheet_by_name(sheetName);
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }
  return sheet;
}

function wsiNowStr_() {
  if (typeof nowStr_ === 'function') {
    return nowStr_();
  }
  const timeZone = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  return Utilities.formatDate(new Date(), timeZone, 'dd/MM/yyyy HH:mm');
}

function wsiGenerateId_() {
  if (typeof generateId_ === 'function') {
    return generateId_();
  }
  return Utilities.getUuid();
}

function wsiFindRowByValue_(sheet, headerName, value) {
  if (typeof findRowByValue_ === 'function') {
    return findRowByValue_(sheet, headerName, value);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return -1;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const headerIndex = headers.indexOf(headerName);
  if (headerIndex === -1) {
    return -1;
  }

  const values = sheet.getRange(2, headerIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i += 1) {
    if (wsiSameValue_(values[i][0], value)) {
      return i + 2;
    }
  }

  return -1;
}

function wsiReadRowAsObject_(sheet, rowIndex) {
  if (typeof readRowAsObject_ === 'function') {
    return readRowAsObject_(sheet, rowIndex);
  }

  const lastColumn = sheet.getLastColumn();
  if (rowIndex < 2 || rowIndex > sheet.getLastRow() || lastColumn < 1) {
    return null;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const obj = {};
  for (let i = 0; i < headers.length; i += 1) {
    obj[headers[i]] = row[i];
  }
  return obj;
}

function wsiUpdateRow_(sheet, rowIndex, patchObj) {
  if (typeof updateRow_ === 'function') {
    updateRow_(sheet, rowIndex, patchObj);
    return;
  }

  if (!patchObj || typeof patchObj !== 'object') {
    return;
  }

  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const keys = Object.keys(patchObj);

  for (let i = 0; i < keys.length; i += 1) {
    const index = headers.indexOf(keys[i]);
    if (index === -1) {
      continue;
    }
    row[index] = patchObj[keys[i]];
  }

  sheet.getRange(rowIndex, 1, 1, lastColumn).setValues([row]);
}

function wsiReadAllRowsAsObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  const result = [];

  for (let i = 0; i < rows.length; i += 1) {
    const obj = {};
    for (let j = 0; j < headers.length; j += 1) {
      obj[headers[j]] = rows[i][j];
    }
    result.push(obj);
  }

  return result;
}

function wsiAsObjectOrNull_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function wsiSameValue_(left, right) {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return false;
  }

  const leftText = String(left).trim();
  const rightText = String(right).trim();
  if (leftText === rightText) {
    return true;
  }

  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  if (
    leftText !== '' &&
    rightText !== '' &&
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber)
  ) {
    return leftNumber === rightNumber;
  }

  return false;
}

function wsiBadRequest_(message, details) {
  return error_response('BAD_REQUEST', message, details || {});
}

function wsiNotFound_(message, details) {
  return error_response('NOT_FOUND', message, details || {});
}

function wsiInternalError_(context, error) {
  Logger.log(`${context} error: ${error && error.message ? error.message : error}`);
  return error_response(
    'INTERNAL_ERROR',
    error && error.message ? error.message : 'Unexpected error',
    { context: context },
  );
}
