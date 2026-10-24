/**
 * Pop Epoch guild titles: members upload their Hall of Honor screenshot,
 * the page reads it and saves the result into the "Master Sheet" tab.
 */
// Leave empty when this script is opened from the sheet (Extensions → Apps Script).
// Only fill in a sheet ID (the long part of its link) if the script lives on its own at script.google.com.
var SPREADSHEET_ID = '';
var MASTER_SHEET = 'Master Sheet';
var LOG_SHEET = 'Upload Log';
var UPDATED_HEADER = 'Last updated';   // member uploaded their own screenshot
var LEADER_HEADER = 'Last leader';     // leader confirmed them as event leader
var TITLE_HEADERS = [
  'Justice Official', 'City Official', 'Military Official', 'Finance Official', 'Transport Official',
  'Eastern Lord', 'Southern Lord', 'Western Lord', 'Northern Lord',
  'Fearless Overlord', 'Triumphant Overlord', 'Blazing Overlord', 'Steelheart Overlord',
  'King of the Nine Realms', 'King of All Realms', 'King of the 7 Seas'
];

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Guild Titles')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function book_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActive();
}

function sheet_() {
  var sh = book_().getSheetByName(MASTER_SHEET);
  if (!sh) throw new Error('Cannot find the "' + MASTER_SHEET + '" tab.');
  return sh;
}

// Maps each title (and "Player" / "Last updated") to its column number, by reading row 1.
function columns_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var cols = {};
  headers.forEach(function (h, i) { if (h) cols[h] = i + 1; });
  TITLE_HEADERS.concat(['Player']).forEach(function (h) {
    if (!cols[h]) throw new Error('Column "' + h + '" is missing in row 1 of ' + MASTER_SHEET + '.');
  });
  var next = headers.length + 1;
  [UPDATED_HEADER, LEADER_HEADER].forEach(function (h) {
    if (cols[h]) return;
    cols[h] = next++;
    sh.getRange(1, cols[h]).setValue(h);
  });
  return cols;
}

function key_(name) {
  return String(name).trim().toLowerCase();
}

function getPlayers() {
  var sh = sheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(String)
    .sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
}

/** counts = {"Justice Official": 1, ...}; titles not owned are 0. */
function saveTitles(name, counts) {
  name = String(name || '').trim();
  if (!name) throw new Error('Please choose your name.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), cols = columns_(sh), found = findRow_(sh, cols, name), row = found.row;
    if (found.isNew) sh.getRange(row, cols.Player).setValue(name);
    var now = new Date();
    TITLE_HEADERS.forEach(function (t) {
      var n = Math.max(0, Math.round(Number(counts[t]) || 0));
      sh.getRange(row, cols[t]).setValue(n > 0 ? n : '');
    });
    sh.getRange(row, cols[UPDATED_HEADER]).setValue(now);
    log_([now, name].concat(TITLE_HEADERS.map(function (t) { return Number(counts[t]) || ''; })));
    return {isNew: found.isNew};
  } finally {
    lock.releaseLock();
  }
}

// Row of a player (matched ignoring case and spaces), or the next empty row if they are new.
function findRow_(sh, cols, name) {
  var last = sh.getLastRow();
  var names = last >= 2 ? sh.getRange(2, cols.Player, last - 1, 1).getValues() : [];
  for (var i = 0; i < names.length; i++) if (key_(names[i][0]) === key_(name)) return {row: i + 2, isNew: false};
  return {row: last + 1, isNew: true};
}

function log_(values) {
  var log = book_().getSheetByName(LOG_SHEET);
  if (!log) {
    log = book_().insertSheet(LOG_SHEET);
    log.appendRow(['Time', 'Player'].concat(TITLE_HEADERS));
  }
  log.appendRow(values);
}

// Don't put your code here — set LEADER_CODE in Config.gs. This only refuses the placeholder.
function checkCode_(code) {
  if (!LEADER_CODE || LEADER_CODE === 'CHANGE-ME') throw new Error('Leader tools are off: set your own LEADER_CODE in Config.gs first.');
  if (String(code || '').trim() !== LEADER_CODE) throw new Error('Wrong code.');
}

function verifyCode(code) {
  checkCode_(code);
  return true;
}

/**
 * Leader tool: awards = [{title: "Military Official", names: ["Alex", ...], leader: false}];
 * adds +1 of that title to each name. With leader: true it also records today as their "Last leader" date.
 */
function awardTitles(code, awards) {
  checkCode_(code);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), cols = columns_(sh), now = new Date(), done = 0;
    awards.forEach(function (a) {
      if (TITLE_HEADERS.indexOf(a.title) < 0) throw new Error('Unknown title: ' + a.title);
      a.names.forEach(function (name) {
        name = String(name || '').trim();
        if (!name) return;
        var found = findRow_(sh, cols, name), cell = sh.getRange(found.row, cols[a.title]);
        if (found.isNew) sh.getRange(found.row, cols.Player).setValue(name);
        cell.setValue((Number(cell.getValue()) || 0) + 1);
        if (a.leader) sh.getRange(found.row, cols[LEADER_HEADER]).setValue(now);
        log_([now, name + ' (event +1)'].concat(TITLE_HEADERS.map(function (t) { return t === a.title ? 1 : ''; })));
        done++;
      });
    });
    return {done: done};
  } finally {
    lock.releaseLock();
  }
}

/** Leader tool: removes a member's row. Their titles are copied to the Upload Log first, so it can be undone by hand. */
function deleteMember(code, name) {
  checkCode_(code);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), cols = columns_(sh), found = findRow_(sh, cols, name);
    if (found.isNew) throw new Error('"' + name + '" is not in the sheet any more.');
    var row = sh.getRange(found.row, 1, 1, sh.getLastColumn()).getValues()[0];
    log_([new Date(), String(name).trim() + ' (removed)'].concat(TITLE_HEADERS.map(function (t) {
      return Number(row[cols[t] - 1]) || '';
    })));
    sh.deleteRow(found.row);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getStats() {
  var sh = sheet_(), cols = columns_(sh), last = sh.getLastRow();
  var players = [];
  if (last >= 2) {
    var data = sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), cols[LEADER_HEADER])).getValues();
    data.forEach(function (r) {
      var name = String(r[cols.Player - 1]).trim();
      if (!name) return;
      var counts = {};
      TITLE_HEADERS.forEach(function (t) { counts[t] = Number(r[cols[t] - 1]) || 0; });
      var u = r[cols[UPDATED_HEADER] - 1], l = r[cols[LEADER_HEADER] - 1];
      players.push({name: name, counts: counts,
                    updated: u instanceof Date ? u.toISOString() : '',
                    leader: l instanceof Date ? l.toISOString() : ''});
    });
  }
  return {titles: TITLE_HEADERS, players: players};
}
