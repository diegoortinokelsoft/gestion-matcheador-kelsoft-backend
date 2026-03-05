/**
 * work_sessions.gs
 * Data access for work_sessions.
 *
 * Rules:
 * - No business logic
 * - Last write wins
 * - No version checks
 * - update_* only overwrites existing columns
 */

const WORK_SESSIONS_SHEET_NAME = 'work_sessions';

function getSheet_(sheetName) {
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

function nowStr_() {
  const timeZone = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  return Utilities.formatDate(new Date(), timeZone, 'dd/MM/yyyy HH:mm');
}

function generateId_() {
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
    return Utilities.getUuid();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function findRowByValue_(sheet, headerName, value) {
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

  const columnValues = sheet.getRange(2, headerIndex + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < columnValues.length; i += 1) {
    if (sameValue_(columnValues[i][0], value)) {
      return i + 2;
    }
  }

  return -1;
}

function readRowAsObject_(sheet, rowIndex) {
  const lastColumn = sheet.getLastColumn();
  if (rowIndex < 2 || rowIndex > sheet.getLastRow() || lastColumn < 1) {
    return null;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const record = {};

  for (let i = 0; i < headers.length; i += 1) {
    record[headers[i]] = row[i];
  }

  return record;
}

function updateRow_(sheet, rowIndex, patchObj) {
  if (!patchObj || typeof patchObj !== 'object') {
    return;
  }

  const lastColumn = sheet.getLastColumn();
  if (rowIndex < 2 || rowIndex > sheet.getLastRow() || lastColumn < 1) {
    return;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, lastColumn).getValues()[0];
  const patchKeys = Object.keys(patchObj);

  for (let i = 0; i < patchKeys.length; i += 1) {
    const key = patchKeys[i];
    const headerIndex = headers.indexOf(key);
    if (headerIndex === -1) {
      continue;
    }
    row[headerIndex] = patchObj[key];
  }

  sheet.getRange(rowIndex, 1, 1, lastColumn).setValues([row]);
}

function create_session(params) {
  try {
    let payload = asObjectOrNull_(params);
    if (!payload && arguments.length >= 2) {
      const legacyUserId = params;
      const legacyData = asObjectOrNull_(arguments[1]) || {};
      payload = Object.assign({}, legacyData, {
        user_id: Object.prototype.hasOwnProperty.call(legacyData, 'user_id')
          ? legacyData.user_id
          : legacyUserId,
      });
    }
    if (!payload) {
      return badRequest_('params must be an object');
    }

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const createdAt = payload.created_at || nowStr_();

    const row = headers.map(function (header) {
      if (Object.prototype.hasOwnProperty.call(payload, header)) {
        return payload[header];
      }
      if (header === 'session_id') {
        return generateId_();
      }
      if (header === 'session_status') {
        return 'DRAFT';
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
    const createdRowIndex = sheet.getLastRow();
    return success_response(readRowAsObject_(sheet, createdRowIndex));
  } catch (error) {
    return internalError_('create_session', error);
  }
}

function get_session_by_id(params) {
  try {
    const payload = asObjectOrNull_(params) || { session_id: params };
    const sessionId = payload ? payload.session_id : null;
    if (!sessionId) {
      return badRequest_('session_id is required');
    }

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const rowIndex = findRowByValue_(sheet, 'session_id', sessionId);
    if (rowIndex === -1) {
      return success_response(null);
    }

    return success_response(readRowAsObject_(sheet, rowIndex));
  } catch (error) {
    return internalError_('get_session_by_id', error);
  }
}

function get_session_by_user_and_date(params) {
  try {
    const payload = asObjectOrNull_(params) || {
      user_id: params,
      session_date: arguments.length >= 2 ? arguments[1] : null,
    };
    if (!payload) {
      return badRequest_('params must be an object');
    }

    if (payload.user_id == null || !payload.session_date) {
      return badRequest_('user_id and session_date are required');
    }

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) {
      return success_response(null);
    }

    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    const userIdIndex = headers.indexOf('user_id');
    const dateIndex = headers.indexOf('session_date');

    if (userIdIndex === -1 || dateIndex === -1) {
      return success_response(null);
    }

    for (let i = 0; i < rows.length; i += 1) {
      if (sameValue_(rows[i][userIdIndex], payload.user_id) && sameValue_(rows[i][dateIndex], payload.session_date)) {
        return success_response(readRowAsObject_(sheet, i + 2));
      }
    }

    return success_response(null);
  } catch (error) {
    return internalError_('get_session_by_user_and_date', error);
  }
}

function list_sessions(params) {
  try {
    const payload = asObjectOrNull_(params);
    const filters = payload && payload.filters && typeof payload.filters === 'object'
      ? payload.filters
      : payload || {};

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 2 || lastColumn < 1) {
      return success_response([]);
    }

    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
    const sessions = [];
    const dateFrom = parseDdMmYyyy_(filters.date_from);
    const dateTo = parseDdMmYyyy_(filters.date_to);
    const teamFilter = filters.team != null ? filters.team : filters.user_team;
    const statusFilter = filters.status != null ? filters.status : filters.session_status;
    const exactDateFilter = filters.session_date;

    for (let i = 0; i < rows.length; i += 1) {
      const rowObj = {};
      for (let j = 0; j < headers.length; j += 1) {
        rowObj[headers[j]] = rows[i][j];
      }

      if (filters.user_id != null && !sameValue_(rowObj.user_id, filters.user_id)) {
        continue;
      }
      if (teamFilter != null && !sameValue_(rowObj.user_team, teamFilter)) {
        continue;
      }
      if (statusFilter != null && !sameValue_(rowObj.session_status, statusFilter)) {
        continue;
      }
      if (exactDateFilter != null && !sameValue_(rowObj.session_date, exactDateFilter)) {
        continue;
      }

      if (dateFrom || dateTo) {
        const sessionDate = parseDdMmYyyy_(rowObj.session_date);
        if (!sessionDate) {
          continue;
        }
        if (dateFrom && sessionDate < dateFrom) {
          continue;
        }
        if (dateTo && sessionDate > dateTo) {
          continue;
        }
      }

      sessions.push(rowObj);
    }

    return success_response(sessions);
  } catch (error) {
    return internalError_('list_sessions', error);
  }
}

function update_session(params) {
  try {
    const payload = asObjectOrNull_(params) || {
      session_id: params,
      patch: arguments.length >= 2 ? arguments[1] : null,
    };
    if (!payload) {
      return badRequest_('params must be an object');
    }

    const sessionId = payload.session_id;
    const patch = asObjectOrNull_(payload.patch);
    if (!sessionId) {
      return badRequest_('session_id is required');
    }
    if (!patch) {
      return badRequest_('patch must be an object');
    }

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const rowIndex = findRowByValue_(sheet, 'session_id', sessionId);
    if (rowIndex === -1) {
      return notFound_('Session not found', { session_id: sessionId });
    }

    updateRow_(sheet, rowIndex, patch);
    return success_response(readRowAsObject_(sheet, rowIndex));
  } catch (error) {
    return internalError_('update_session', error);
  }
}

function delete_session(params) {
  try {
    const payload = asObjectOrNull_(params) || { session_id: params };
    const sessionId = payload ? payload.session_id : null;
    if (!sessionId) {
      return badRequest_('session_id is required');
    }

    const sheet = getSheet_(WORK_SESSIONS_SHEET_NAME);
    const rowIndex = findRowByValue_(sheet, 'session_id', sessionId);
    if (rowIndex === -1) {
      return notFound_('Session not found', { session_id: sessionId });
    }

    sheet.deleteRow(rowIndex);
    return success_response({ session_id: sessionId, deleted: true });
  } catch (error) {
    return internalError_('delete_session', error);
  }
}

function get_open_session_by_user_and_date(user_id, session_date) {
  return get_session_by_user_and_date({
    user_id: user_id,
    session_date: session_date,
  });
}

function asObjectOrNull_(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function parseDdMmYyyy_(value) {
  if (value == null || value === '') {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value).trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function sameValue_(left, right) {
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

function badRequest_(message, details) {
  return error_response('BAD_REQUEST', message, details || {});
}

function notFound_(message, details) {
  return error_response('NOT_FOUND', message, details || {});
}

function internalError_(context, error) {
  Logger.log(`${context} error: ${error && error.message ? error.message : error}`);
  return error_response(
    'INTERNAL_ERROR',
    error && error.message ? error.message : 'Unexpected error',
    { context: context },
  );
}
