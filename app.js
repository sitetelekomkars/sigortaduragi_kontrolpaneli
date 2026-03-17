/**
 * Sigorta Durağı - Google Sheets Bridge (v3.0)
 * Düzeltilenler:
 * - Poliçe header standardizasyonu
 * - Şirket / branş alanlarının güncellemede boş gelme sorunu
 * - Eski kolon dizilimlerini otomatik eşleme
 * - Poliçe silme desteği
 */

var POLICY_HEADERS = [
  'id', 'status', 'issue_date', 'start_date', 'expiry_date', 'policy_no',
  'customer_name', 'customer_id', 'phone', 'birth_date', 'ek_no', 'region',
  'company', 'branch', 'description', 'net_premium', 'gross_premium',
  'commission', 'notes', 'doc_url'
];

// --- GÜVENLİK AYARLARI ---
var GLOBAL_API_KEY = "SD_SERVER_SECURE_KEY_2024"; 
var SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 4; // 4 saat oturum süresi

var SHEET_HEADERS = {
  'Poliçeler': POLICY_HEADERS,
  'Teklifler': ['id', 'date', 'customer', 'risk', 'company', 'amount', 'status'],
  'Bilanço': ['id', 'date', 'type', 'category', 'description', 'amount'],
  'Kullanıcılar': ['username', 'password_hash', 'role', 'full_name', 'token', 'token_expiry', 'force_password_change', 'two_fa_secret', 'two_fa_enabled'],
  'Ayarlar': ['type', 'value'],
  'Loglar': ['timestamp', 'username', 'action', 'details', 'ip']
};

var POLICY_ALIASES = {
  id: ['id', 'ID'],
  status: ['status', 'durum'],
  issue_date: ['issue_date', 'issueDate', 'tanzim_tarihi', 'tanzim'],
  start_date: ['start_date', 'startDate', 'baslangic_tarihi', 'police_baslangic'],
  expiry_date: ['expiry_date', 'expiryDate', 'bitis_tarihi', 'vade', 'police_bitis'],
  policy_no: ['policy_no', 'police_no', 'police', 'policyNumber'],
  customer_name: ['customer_name', 'customer', 'musteri', 'musteri_ad_soyad', 'unvan'],
  customer_id: ['customer_id', 'tc_vkn', 'tc', 'vkn'],
  phone: ['phone', 'telefon'],
  birth_date: ['birth_date', 'dogum_tarihi'],
  ek_no: ['ek_no', 'ekno', 'ekNo'],
  region: ['region', 'bolge'],
  company: ['company', 'sirket', 'company_name'],
  branch: ['branch', 'brans', 'branch_name'],
  description: ['description', 'aciklama', 'plaka'],
  net_premium: ['net_premium', 'net', 'netPrim'],
  gross_premium: ['gross_premium', 'gross', 'brut_prim', 'brutPrim'],
  commission: ['commission', 'komisyon'],
  notes: ['notes', 'note', 'notlar'],
  doc_url: ['doc_url', 'document_url', 'evrak_url', 'drive_url']
};

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEET_HEADERS).forEach(function(name) {
    ensureSheetHeader_(getOrCreateSheet(ss, name), SHEET_HEADERS[name]);
  });
  ss.getSheets().forEach(function(s) { s.setFrozenRows(1); });
}

function fixSheetAlignment() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Poliçeler');
  if (!sheet) return;
  normalizePolicySheet_(sheet);
  Logger.log('Poliçe kolonları standardize edildi. İnsanlığın nadir düzgün anlarından biri.');
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = params.action;
  var apiKey = params.apiKey;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (apiKey !== GLOBAL_API_KEY) return createJsonResponse({ status: 'error', message: 'Yetkisiz erişim' });
  
  // Secure File Download/Proxy
  if (action === 'getFile') return handleGetFile_(ss, params);

  // Other GET actions require Session Token
  var session = validateSession_(ss, params.sessionToken);
  if (!session.valid) return createJsonResponse({ status: 'error', code: 'UNAUTHORIZED', message: 'Oturum geçersiz.' });

  if (action === 'getPolicies') return createJsonResponse(readSheetData(ss.getSheetByName('Poliçeler')));
  if (action === 'getLogs') return createJsonResponse(readSheetData(ss.getSheetByName('Loglar')));
  if (action === 'getUsers') return createJsonResponse(readSheetData(ss.getSheetByName('Kullanıcılar')));
  if (action === 'getProposals') return createJsonResponse(readSheetData(ss.getSheetByName('Teklifler')));
  if (action === 'getFinance') return createJsonResponse(readSheetData(ss.getSheetByName('Bilanço')));
  if (action === 'getSettings') return createJsonResponse(readSheetData(ss.getSheetByName('Ayarlar')));
  
  return createJsonResponse({ status: 'error', message: 'Invalid action' });
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents || '{}');
    var apiKey = payload.apiKey;
    
    if (apiKey !== GLOBAL_API_KEY) return createJsonResponse({ status: 'error', message: 'Yetkisiz erişim (API Key Hatalı)' });

    var action = payload.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Login and Setup actions only require API Key
    if (action === 'login') return handleLogin_(ss, payload);
    if (action === 'verify2FA') return handleVerify2FA_(ss, payload);
    if (action === 'setup2FA') return handleSetup2FA_(ss, payload);
    
    // All other actions REQUIRE a valid Dynamic Session Token + API Key
    var sessionToken = payload.sessionToken;
    var session = validateSession_(ss, sessionToken);
    
    if (!session.valid) {
      return createJsonResponse({ 
        status: 'error', 
        code: 'UNAUTHORIZED', 
        message: 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.' 
      });
    }
    
    // Set current user for logging
    payload.current_user = session.username;

    if (action === 'savePolicy') {
      var policySheet = getOrCreateSheet(ss, 'Poliçeler');
      normalizePolicySheet_(policySheet);
      return handleGenericSave(ss, 'Poliçeler', normalizePolicyPayload_(payload.data || {}), 'id');
    }
    if (action === 'deletePolicy') return handleDelete(ss, 'Poliçeler', 'id', payload.id);
    if (action === 'saveUser') return handleGenericSave(ss, 'Kullanıcılar', payload.data || {}, 'username');
    if (action === 'saveProposal') return handleGenericSave(ss, 'Teklifler', payload.data || {}, 'id');
    if (action === 'saveFinance') return handleGenericSave(ss, 'Bilanço', payload.data || {}, 'id');
    if (action === 'saveSetting') {
      var sheet = getOrCreateSheet(ss, 'Ayarlar');
      ensureSheetHeader_(sheet, SHEET_HEADERS['Ayarlar']);
      sheet.appendRow([payload.type, payload.value]);
      return createJsonResponse({ status: 'success' });
    }
    if (action === 'deleteSetting') {
      var settingsSheet = getOrCreateSheet(ss, 'Ayarlar');
      ensureSheetHeader_(settingsSheet, SHEET_HEADERS['Ayarlar']);
      var data = settingsSheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(payload.type).trim() && String(data[i][1]).trim() === String(payload.value).trim()) {
          settingsSheet.deleteRow(i + 1);
          break;
        }
      }
      return createJsonResponse({ status: 'success' });
    }
    if (action === 'uploadFile') return handleUpload_(payload);
    if (action === 'deleteUser') return handleDelete(ss, 'Kullanıcılar', 'username', payload.username);
    if (action === 'addLog') {
      var logSheet = getOrCreateSheet(ss, 'Loglar');
      ensureSheetHeader_(logSheet, SHEET_HEADERS['Loglar']);
      var now = Utilities.formatDate(new Date(), "Europe/Istanbul", "dd.MM.yyyy HH:mm:ss");
      logSheet.appendRow([now, session.username, payload.action_type, payload.details, payload.ip]);
      return createJsonResponse({ status: 'success' });
    }

    return createJsonResponse({ status: 'error', message: 'Invalid action' });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function handleLogin_(ss, payload) {
  var users = readSheetData(getOrCreateSheet(ss, 'Kullanıcılar'));
  var username = String(payload.username || '').toLowerCase().trim();
  // payload.password is already SHA-256 hashed from the frontend
  var password = String(payload.password || '').trim().toLowerCase();
  var user = users.find(function(u) {
    // Compare SHA-256 hashed values (case-insensitive for hex strings)
    return String(u.username || '').toLowerCase().trim() === username &&
           String(u.password_hash || '').trim().toLowerCase() === password;
  });
  
  if (!user) return createJsonResponse({ status: 'error', message: 'Hatalı şifre veya kullanıcı adı.' });
  
  // If 2FA is enabled, return a temporary success asking for code
  if (user.two_fa_enabled === true || user.two_fa_enabled === 'TRUE') {
    return createJsonResponse({ 
      status: '2fa_required', 
      username: user.username 
    });
  }

  // Generate Session Token
  var token = generateSessionToken_(ss, user.username);
  
  return createJsonResponse({
    status: 'success',
    sessionToken: token,
    user: {
      username: user.username,
      role: user.role,
      name: user.full_name,
      forceChange: user.force_password_change === true || user.force_password_change === 'TRUE'
    }
  });
}

function handleVerify2FA_(ss, payload) {
  var users = readSheetData(getOrCreateSheet(ss, 'Kullanıcılar'));
  var username = String(payload.username || '').toLowerCase().trim();
  var code = String(payload.code || '').trim();
  
  var user = users.find(function(u) {
    return String(u.username || '').toLowerCase().trim() === username;
  });

  if (!user) return createJsonResponse({ status: 'error', message: 'Kullanıcı bulunamadı.' });
  
  var isValid = verifyTOTP(user.two_fa_secret, code);
  if (!isValid) return createJsonResponse({ status: 'error', message: 'Geçersiz 2FA kodu.' });

  // TOTP Valid -> Generate Dynamic Session Token
  var token = generateSessionToken_(ss, user.username);

  return createJsonResponse({
    status: 'success',
    sessionToken: token,
    user: {
      username: user.username,
      role: user.role,
      name: user.full_name,
      forceChange: user.force_password_change === true || user.force_password_change === 'TRUE'
    }
  });
}

function handleSetup2FA_(ss, payload) {
  var username = String(payload.username || '').toLowerCase().trim();
  var secret = generateSecret();
  
  // Save secret to user
  var sheet = getOrCreateSheet(ss, 'Kullanıcılar');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var userIdx = -1;
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]).toLowerCase().trim() === username) {
      userIdx = i + 1;
      break;
    }
  }
  
  if (userIdx === -1) return createJsonResponse({ status: 'error', message: 'Kullanıcı bulunamadı.' });
  
  var secretCol = headers.indexOf('two_fa_secret') + 1;
  var enabledCol = headers.indexOf('two_fa_enabled') + 1;
  
  sheet.getRange(userIdx, secretCol).setValue(secret);
  sheet.getRange(userIdx, enabledCol).setValue('TRUE'); // Enable it immediately for demo
  
  return createJsonResponse({ 
    status: 'success', 
    secret: secret,
    qrUrl: "otpauth://totp/SigortaDuragi:" + username + "?secret=" + secret + "&issuer=SigortaDuragi"
  });
}

// --- TOTP UTILITIES ---
function verifyTOTP(secret, code) {
  if (!secret || !code) return false;
  var time = Math.floor(new Date().getTime() / 1000 / 30);
  
  // Check current and +/- 1 window for time drift
  for (var i = -1; i <= 1; i++) {
    if (getTOTPCode(secret, time + i) === code) return true;
  }
  return false;
}

function getTOTPCode(secret, time) {
  var key = base32tohex(secret);
  var timeByte = leftpad(dec2hex(time), 16, '0');
  
  var hmac = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, hexToBytes(timeByte), hexToBytes(key));
  var hmacHex = bytesToHex(hmac);
  
  var offset = hex2dec(hmacHex.substring(hmacHex.length - 1));
  var otp = (hex2dec(hmacHex.substr(offset * 2, 8)) & hex2dec('7fffffff')) + '';
  otp = (otp).substr(otp.length - 6, 6);
  return leftpad(otp, 6, '0');
}

function generateSecret(length) {
  length = length || 16;
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var secret = "";
  for (var i = 0; i < length; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return secret;
}

function dec2hex(s) { return (s < 15.5 ? '0' : '') + Math.round(s).toString(16); }
function hex2dec(s) { return parseInt(s, 16); }
function leftpad(str, len, pad) {
  if (len + 1 >= str.length) { str = Array(len + 1 - str.length).join(pad) + str; }
  return str;
}

function base32tohex(base32) {
  var base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  var bits = "";
  var hex = "";
  for (var i = 0; i < base32.length; i++) {
    var val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    bits += leftpad(val.toString(2), 5, '0');
  }
  for (var i = 0; i + 4 <= bits.length; i += 4) {
    var chunk = bits.substr(i, 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function hexToBytes(hex) {
  var bytes = [];
  for (var c = 0; c < hex.length; c += 2)
    bytes.push(parseInt(hex.substr(c, 2), 16));
  // GAS requires signed bytes, so convert
  return bytes.map(function(b) { return b > 127 ? b - 256 : b; });
}

function bytesToHex(bytes) {
  return bytes.map(function(byte) {
    var b = byte < 0 ? byte + 256 : byte;
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}

function handleUpload_(payload) {
  try {
    var folderId = '1hSlah2_3MZBb8EqJlrqDgYol2ajmGBcc';
    var folder = DriveApp.getFolderById(folderId);
    var blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), payload.mimeType, payload.fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return createJsonResponse({ status: 'success', url: file.getUrl() });
  } catch (e) {
    return createJsonResponse({ status: 'error', message: e.toString() });
  }
}

function normalizePolicyPayload_(item) {
  var normalized = {};
  POLICY_HEADERS.forEach(function(key) {
    normalized[key] = pickFirst_(item, POLICY_ALIASES[key] || [key]);
  });
  if (!normalized.id) normalized.id = new Date().getTime();
  if (!normalized.status) normalized.status = 'Aktif';
  return normalized;
}

function normalizePolicySheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data.length) {
    ensureSheetHeader_(sheet, POLICY_HEADERS);
    return;
  }

  var oldHeaders = data[0].map(function(h) { return String(h || '').trim(); });
  var same = oldHeaders.length === POLICY_HEADERS.length && POLICY_HEADERS.every(function(h, i) { return h === oldHeaders[i]; });
  if (same) return;

  var rows = data.slice(1).map(function(row) {
    var obj = {};
    oldHeaders.forEach(function(h, i) { obj[h] = row[i]; });
    var normalized = normalizePolicyPayload_(obj);
    return POLICY_HEADERS.map(function(h) { return normalized[h] !== undefined ? normalized[h] : ''; });
  });

  sheet.clearContents();
  ensureSheetHeader_(sheet, POLICY_HEADERS);
  if (rows.length) sheet.getRange(2, 1, rows.length, POLICY_HEADERS.length).setValues(rows);
}

function ensureSheetHeader_(sheet, headers) {
  var existing = [];
  if (sheet.getLastRow() > 0 && sheet.getLastColumn() > 0) {
    existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
      .slice(0, headers.length)
      .map(function(h) { return String(h || '').trim(); });
  }
  var different = headers.some(function(h, i) { return existing[i] !== h; });
  if (sheet.getLastRow() === 0 || different) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function readSheetData(sheet) {
  if (!sheet) return [];
  if (sheet.getName() === 'Poliçeler') normalizePolicySheet_(sheet);
  else ensureSheetHeader_(sheet, SHEET_HEADERS[sheet.getName()] || []);

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(function(h) { return String(h || '').trim(); });
  return data.slice(1).filter(function(row) {
    return row.some(function(cell) { return String(cell || '').trim() !== ''; });
  }).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { if (h) obj[h] = row[i]; });
    return obj;
  });
}

function handleGenericSave(ss, sheetName, item, idKey) {
  var sheet = getOrCreateSheet(ss, sheetName);
  var headers = SHEET_HEADERS[sheetName] || [];
  if (sheetName === 'Poliçeler') normalizePolicySheet_(sheet);
  else ensureSheetHeader_(sheet, headers);

  var data = sheet.getDataRange().getValues();
  headers = (data[0] || headers).map(function(h) { return String(h || '').trim(); });
  var idIdx = headers.indexOf(idKey);
  var lookupVal = String(item[idKey] || '').toLowerCase().trim();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx] || '').toLowerCase().trim() === lookupVal) {
      rowIndex = i + 1;
      break;
    }
  }

  var rowValues = headers.map(function(h, idx) {
    if (item[h] !== undefined && item[h] !== null) return item[h];
    if (rowIndex > -1) return data[rowIndex - 1][idx];
    return '';
  });

  if (rowIndex > -1) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowValues]);
  else sheet.appendRow(rowValues);

  return createJsonResponse({ status: 'success' });
}

function handleDelete(ss, sheetName, idKey, idVal) {
  var sheet = getOrCreateSheet(ss, sheetName);
  if (sheetName === 'Poliçeler') normalizePolicySheet_(sheet);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return createJsonResponse({ status: 'error', message: 'Not found' });
  var headers = data[0].map(function(h) { return String(h || '').trim(); });
  var colIdx = headers.indexOf(idKey);
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIdx] || '').toLowerCase().trim() === String(idVal || '').toLowerCase().trim()) {
      sheet.deleteRow(i + 1);
      return createJsonResponse({ status: 'success' });
    }
  }
  return createJsonResponse({ status: 'error', message: 'Not found' });
}

function pickFirst_(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (obj.hasOwnProperty(key) && obj[key] !== '' && obj[key] !== null && obj[key] !== undefined) return obj[key];
  }
  return '';
}

// --- SECURITY UTILITIES ---
function sha256(str) {
  var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return signature.map(function(byte) {
    var b = byte < 0 ? byte + 256 : byte;
    return ('0' + b.toString(16)).slice(-2);
  }).join('');
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// --- SESSION HELPERS ---

function generateSessionToken_(ss, username) {
  var token = Utilities.getUuid();
  var expiry = new Date().getTime() + SESSION_TIMEOUT_MS;
  
  var sheet = ss.getSheetByName('Kullanıcılar');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var tokenCol = headers.indexOf('token') + 1;
  var expiryCol = headers.indexOf('token_expiry') + 1;
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === username.toLowerCase().trim()) {
      sheet.getRange(i + 1, tokenCol).setValue(token);
      sheet.getRange(i + 1, expiryCol).setValue(expiry);
      break;
    }
  }
  return token;
}

function validateSession_(ss, token) {
  if (!token) return { valid: false };
  var sheet = ss.getSheetByName('Kullanıcılar');
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var tokenCol = headers.indexOf('token');
  var expiryCol = headers.indexOf('token_expiry');
  var now = new Date().getTime();

  for (var i = 1; i < data.length; i++) {
    if (data[i][tokenCol] === token) {
      var expiry = parseInt(data[i][expiryCol]);
      if (now < expiry) {
        // Slide expiry forward to keep session alive during activity
        sheet.getRange(i + 1, expiryCol + 1).setValue(now + SESSION_TIMEOUT_MS);
        return { valid: true, username: data[i][0] };
      }
    }
  }
  return { valid: false };
}

function handleGetFile_(ss, params) {
  var token = params.sessionToken;
  var session = validateSession_(ss, token);
  if (!session.valid) return ContentService.createTextOutput("Unauthorized").setMimeType(ContentService.MimeType.TEXT);
  
  var fileId = params.fileId;
  if (!fileId) return ContentService.createTextOutput("Missing File ID").setMimeType(ContentService.MimeType.TEXT);
  
  try {
    var file = DriveApp.getFileById(fileId);
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.TEXT)
      .append(JSON.stringify({
        status: 'success',
        downloadUrl: file.getDownloadUrl(),
        mimeType: file.getMimeType(),
        name: file.getName()
      }));
  } catch (e) {
    return createJsonResponse({ status: 'error', message: 'Dosya bulunamadı.' });
  }
}

function findUser_(ss, username) {
  var users = readSheetData(ss.getSheetByName('Kullanıcılar'));
  var user = users.find(function(u) { return u.username === username; });
  return user ? { data: user } : null;
}
