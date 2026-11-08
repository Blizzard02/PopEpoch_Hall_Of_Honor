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
var EVENTS_SHEET = 'Events';           // planned events, waiting for their result
var EVENT_HEADERS = ['ID', 'Created', 'Event', 'Leader', 'Leader title', 'Elites title', 'Elites', 'Members title',
                     '2nd: leader title', '2nd: elites title', '2nd: members title', 'Result', 'Closed'];
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
    log_([[now, name].concat(TITLE_HEADERS.map(function (t) { return Number(counts[t]) || ''; }))]);
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

// rows = a list of log lines, written in one go.
function log_(rows) {
  if (!rows.length) return;
  var log = book_().getSheetByName(LOG_SHEET);
  if (!log) {
    log = book_().insertSheet(LOG_SHEET);
    log.appendRow(['Time', 'Player'].concat(TITLE_HEADERS));
  }
  log.getRange(log.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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
    var sh = sheet_();
    return {done: award_(sh, columns_(sh), awards, 'event')};
  } finally {
    lock.releaseLock();
  }
}

// Adds the awards to the Master Sheet (call it inside the lock). Returns how many titles were added.
function award_(sh, cols, awards, label) {
  awards.forEach(function (a) {
    if (TITLE_HEADERS.indexOf(a.title) < 0) throw new Error('Unknown title: ' + a.title);
  });
  var now = new Date(), logs = [];
  awards.forEach(function (a) {
    a.names.forEach(function (name) {
      name = String(name || '').trim();
      if (!name) return;
      var found = findRow_(sh, cols, name), cell = sh.getRange(found.row, cols[a.title]);
      if (found.isNew) sh.getRange(found.row, cols.Player).setValue(name);
      cell.setValue((Number(cell.getValue()) || 0) + 1);
      if (a.leader) sh.getRange(found.row, cols[LEADER_HEADER]).setValue(now);
      logs.push([now, name + ' (' + label + ' +1)'].concat(TITLE_HEADERS.map(function (t) { return t === a.title ? 1 : ''; })));
    });
  });
  log_(logs);
  return logs.length;
}

function checkTitle_(t) {
  if (t && TITLE_HEADERS.indexOf(t) < 0) throw new Error('Unknown title: ' + t);
}

function events_() {
  var sh = book_().getSheetByName(EVENTS_SHEET);
  if (!sh) {
    sh = book_().insertSheet(EVENTS_SHEET);
    sh.appendRow(EVENT_HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Every event in the Events tab (columns in EVENT_HEADERS order). Elites are one name per line.
function readEvents_(sh) {
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, EVENT_HEADERS.length).getValues().map(function (r, i) {
    var s = r.map(function (v) { return String(v).trim(); });
    return {row: i + 2, id: s[0], name: s[2], leader: s[3], leaderTitle: s[4], eliteTitle: s[5],
            elites: s[6].split('\n').map(function (n) { return n.trim(); }).filter(String),
            memberTitle: s[7], second: {leader: s[8], elite: s[9], member: s[10]}, result: s[11]};
  }).filter(function (e) { return e.id; });
}

/** Leader tool: the events still waiting for a result. */
function listEvents(code) {
  checkCode_(code);
  return readEvents_(events_()).filter(function (e) { return !e.result; });
}

/**
 * Leader tool: saves a planned event. ev = {name, leader, leaderTitle, eliteTitle, elites: [...], memberTitle,
 * second: {leader, elite, member}}; empty titles mean "nothing". memberTitle goes to everyone else in the guild.
 */
function saveEvent(code, ev) {
  checkCode_(code);
  var s = ev.second || {};
  [ev.leaderTitle, ev.eliteTitle, ev.memberTitle, s.leader, s.elite, s.member].forEach(checkTitle_);
  var id = Utilities.getUuid().slice(0, 8);
  events_().appendRow([id, new Date(), String(ev.name || 'Event').trim(), ev.leader || '', ev.leaderTitle || '',
                       ev.eliteTitle || '', (ev.elites || []).join('\n'), ev.memberTitle || '',
                       s.leader || '', s.elite || '', s.member || '', '', '']);
  return id;
}

/**
 * Leader tool: closes an event with result 'won', '2nd' or 'lost' and adds the matching titles.
 * The leader's "Last leader" date is only saved when they get a title.
 */
function closeEvent(code, id, result) {
  checkCode_(code);
  var labels = {won: 'Won', '2nd': '2nd place', lost: 'Lost'};
  if (!labels[result]) throw new Error('Unknown result: ' + result);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var esh = events_(), ev = readEvents_(esh).filter(function (e) { return e.id === String(id); })[0];
    if (!ev) throw new Error('This event is not in the ' + EVENTS_SHEET + ' tab any more.');
    if (ev.result) throw new Error('This event was already closed (' + ev.result + ').');
    var get = result === 'won' ? {leader: ev.leaderTitle, elite: ev.eliteTitle, member: ev.memberTitle}
            : result === '2nd' ? ev.second : {};
    var sh = sheet_(), cols = columns_(sh), awards = [];
    if (get.leader && ev.leader) awards.push({title: get.leader, names: [ev.leader], leader: true});
    if (get.elite && ev.elites.length) awards.push({title: get.elite, names: ev.elites});
    if (get.member) {
      var taken = [ev.leader].concat(ev.elites).map(key_);
      awards.push({title: get.member, names: getPlayers().filter(function (n) { return taken.indexOf(key_(n)) < 0; })});
    }
    var done = award_(sh, cols, awards, ev.name);
    esh.getRange(ev.row, EVENT_HEADERS.indexOf('Result') + 1, 1, 2).setValues([[labels[result], new Date()]]);
    return {done: done};
  } finally {
    lock.releaseLock();
  }
}

/** Leader tool: adds a new member (name only, no titles yet). */
function addMember(code, name) {
  checkCode_(code);
  name = String(name || '').trim();
  if (!name) throw new Error('Please type a name.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(), cols = columns_(sh), found = findRow_(sh, cols, name);
    if (!found.isNew) throw new Error('"' + name + '" is already in the list.');
    sh.getRange(found.row, cols.Player).setValue(name);
    log_([[new Date(), name + ' (added)'].concat(TITLE_HEADERS.map(function () { return ''; }))]);
    return true;
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
    log_([[new Date(), String(name).trim() + ' (removed)'].concat(TITLE_HEADERS.map(function (t) {
      return Number(row[cols[t] - 1]) || '';
    }))]);
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
