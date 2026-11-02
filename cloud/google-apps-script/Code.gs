/**
 * Atlas cloud migration, stage 1: private Upstox premarket membership receipt.
 *
 * Free Google Apps Script time trigger; no Cloud Billing project, broker token,
 * order endpoint, public sharing, paid service, or market quote is used.
 * Stored evidence is membership only, never 09:40 quotes or backtest results.
 */

const ATLAS_GAS = Object.freeze({
  timezone: "Asia/Kolkata",
  folderName: "Atlas Private Market Archive",
  folderProperty: "ATLAS_PRIVATE_ARCHIVE_FOLDER_ID",
  urls: Object.freeze({
    MIS: "https://assets.upstox.com/market-quote/instruments/exchange/NSE_MIS.json.gz",
    BOD: "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
  }),
  maxCompressed: Object.freeze({ MIS: 1500000, BOD: 5000000 }),
  maxUnpacked: Object.freeze({ MIS: 3000000, BOD: 100000000 }),
  symbolPattern: /^(?=.{1,30}$)(?=.*[A-Z])[A-Z0-9&-]+$/,
  // Official NSE cash-equities holidays for 2026, captured from the NSE page.
  // Fail closed outside a year whose official calendar is embedded here.
  calendarYear: "2026",
  holidays2026: Object.freeze([
    "2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26",
    "2026-03-31", "2026-04-03", "2026-04-14", "2026-05-01",
    "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02",
    "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25"
  ]),
  specialSessions2026: Object.freeze(["2026-11-08"]),
  calendarSource: "https://www.nseindia.com/resources/exchange-communication-holidays?apiversion=v2",
  calendarObservedOn: "2026-10-29"
});

/**
 * Run once from the Apps Script editor after reviewing the scopes. This creates
 * one daily trigger at approximately 07:10 Asia/Kolkata; Apps Script clock
 * triggers are approximate, so this is a premarket archive, not a 09:40 timer.
 */
function atlasInstallPremarketTrigger() {
  const handler = "atlasCapturePremarket";
  const triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  if (triggers.length > 1) throw new Error("duplicate capture triggers require review");
  const existing = triggers.length === 1;
  if (!existing) {
    ScriptApp.newTrigger(handler)
      .timeBased()
      .everyDays(1)
      .atHour(7)
      .nearMinute(10)
      .inTimezone(ATLAS_GAS.timezone)
      .create();
  }
  return { installed: true, created: !existing, handler: handler, timezone: ATLAS_GAS.timezone };
}

/**
 * Captures exact public MIS/BOD gzip bytes, validates normal NSE_EQ identities,
 * and writes immutable private Drive files plus manifests. On any mismatch it
 * fails closed. Re-running a date verifies the existing receipt without
 * replacing it.
 */
function atlasCapturePremarket() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { status: "SKIPPED_LOCKED" };
  try {
    const now = new Date();
    const session = Utilities.formatDate(now, ATLAS_GAS.timezone, "yyyy-MM-dd");
    if (Utilities.formatDate(now, ATLAS_GAS.timezone, "HH:mm") >= "09:15") {
      return { status: "SKIPPED_AFTER_MARKET_OPEN", session_ist: session };
    }
    const calendar = atlasCalendarStatus(session);
    if (calendar.status !== "OPEN_SESSION") {
      Logger.log(JSON.stringify({ status: calendar.status, session: session }));
      return { status: calendar.status, session: session };
    }

    const root = atlasArchiveRoot();
    atlasAssertPrivateFolder(root);
    const existing = atlasFoldersNamed(root, session);
    if (existing.length > 1) throw new Error("ambiguous dated archive folder");
    if (existing.length === 1) {
      return atlasVerifyExisting(existing[0], session);
    }

    const stagePrefix = ".atlas-stage-" + session + "-";
    const stages = [];
    const children = root.getFolders();
    while (children.hasNext()) {
      const candidate = children.next();
      if (candidate.getName().indexOf(stagePrefix) === 0) stages.push(candidate);
    }
    if (stages.length) throw new Error("interrupted staging folder requires review");

    const fetched = {
      MIS: atlasFetchCatalog("MIS", session),
      BOD: atlasFetchCatalog("BOD", session)
    };
    const mis = atlasParseCatalog(fetched.MIS.raw, "MIS");
    const bod = atlasParseCatalog(fetched.BOD.raw, "BOD");
    Object.keys(mis.members).forEach(function (symbol) {
      if (!bod.members[symbol] ||
          !atlasSameIdentity(mis.members[symbol], bod.members[symbol])) {
        throw new Error("MIS identity absent or different in dated BOD");
      }
    });

    const csv = atlasMisCsv(session, mis.members);
    const csvBytes = Utilities.newBlob(csv, "text/csv").getBytes();
    const csvHash = atlasSha256(csvBytes);
    atlasAssertDriveHeadroom(fetched.MIS.raw.length + fetched.BOD.raw.length + csvBytes.length + 8192);
    const stage = root.createFolder(stagePrefix + Utilities.getUuid());
    atlasAssertPrivateFolder(stage);
    stage.setDescription("Private Atlas cloud archive staging; never publicly shared.");
    const stamp = session.replace(/-/g, "");
    ["MIS", "BOD"].forEach(function (kind) {
      const result = fetched[kind];
      const filename = "NSE_" + kind + "_" + stamp + ".json.gz";
      result.receipt.source_file = filename;
      stage.createFile(Utilities.newBlob(result.raw, "application/gzip", filename));
      stage.createFile(
        "NSE_" + kind + "_" + stamp + ".manifest.json",
        JSON.stringify(result.receipt, null, 2) + "\n",
        "application/json"
      );
    });

    const csvName = stamp + "_mis_universe.csv";
    stage.createFile(csvName, csv, "text/csv");
    const csvManifest = {
      schema: "atlas.upstox-mis-universe.v1",
      session_ist: session,
      source_sha256: fetched.MIS.receipt.source_sha256,
      source_last_modified_utc: fetched.MIS.receipt.source_last_modified_utc,
      captured_at_utc: fetched.MIS.receipt.captured_at_utc,
      symbol_count: Object.keys(mis.members).length,
      csv_file: csvName,
      csv_sha256: csvHash,
      evidence_class: "PREMARKET_MEMBERSHIP_ONLY_NO_0940_QUOTES_OR_FILLS"
    };
    stage.createFile(
      stamp + "_mis_universe.manifest.json",
      JSON.stringify(csvManifest, null, 2) + "\n",
      "application/json"
    );
    stage.setName(session);
    stage.setDescription("Private Atlas premarket membership receipt; immutable.");
    return {
      status: "CAPTURED",
      session_ist: session,
      mis_symbols: Object.keys(mis.members).length,
      bod_symbols: Object.keys(bod.members).length,
      mis_sha256: fetched.MIS.receipt.source_sha256,
      bod_sha256: fetched.BOD.receipt.source_sha256,
      derived_csv_sha256: csvHash,
      evidence_class: "PREMARKET_MEMBERSHIP_ONLY"
    };
  } catch (error) {
    Logger.log(JSON.stringify({
      status: "FAILED_CLOSED",
      error_name: error && error.name ? error.name : "Error",
      message: String(error && error.message ? error.message : error).slice(0, 200)
    }));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function atlasCalendarStatus(session) {
  if (session.slice(0, 4) !== ATLAS_GAS.calendarYear) {
    return { status: "SKIPPED_CALENDAR_NOT_LOADED" };
  }
  const weekday = Number(Utilities.formatDate(new Date(session + "T12:00:00Z"),
    ATLAS_GAS.timezone, "u"));
  if (weekday >= 6) return { status: "SKIPPED_WEEKEND" };
  if (ATLAS_GAS.holidays2026.indexOf(session) >= 0) {
    return { status: "SKIPPED_NSE_HOLIDAY" };
  }
  if (ATLAS_GAS.specialSessions2026.indexOf(session) >= 0) {
    return { status: "SKIPPED_SPECIAL_SESSION" };
  }
  return { status: "OPEN_SESSION" };
}

function atlasFetchCatalog(kind, session) {
  const url = ATLAS_GAS.urls[kind];
  const response = UrlFetchApp.fetch(url, {
    method: "get",
    muteHttpExceptions: true,
    followRedirects: false,
    validateHttpsCertificates: true,
    headers: { "Accept": "application/gzip", "User-Agent": "AtlasPrivateResearch/1.0" }
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(kind + " source HTTP status is not 200");
  }
  const headers = response.getHeaders();
  const contentType = atlasHeader(headers, "content-type");
  if (!contentType || String(contentType).toLowerCase().indexOf("application/gzip") !== 0) {
    throw new Error(kind + " source content type is not gzip");
  }
  const raw = response.getBlob().getBytes();
  if (raw.length < 1000 || raw.length > ATLAS_GAS.maxCompressed[kind] ||
      (raw[0] & 255) !== 31 || (raw[1] & 255) !== 139) {
    throw new Error(kind + " gzip size or signature invalid");
  }

  const observed = new Date();
  const lastModifiedText = atlasHeader(headers, "last-modified");
  if (!lastModifiedText) throw new Error(kind + " source lacks Last-Modified");
  const modified = new Date(lastModifiedText);
  if (isNaN(modified.getTime()) ||
      Utilities.formatDate(modified, ATLAS_GAS.timezone, "yyyy-MM-dd") !== session ||
      modified.getTime() > observed.getTime()) {
    throw new Error(kind + " source Last-Modified is invalid for this session");
  }
  const parsed = atlasParseCatalog(raw, kind);
  return {
    raw: raw,
    receipt: {
      schema: "atlas.upstox-premarket-source-receipt.v1",
      session_ist: session,
      kind: kind,
      source_url: url,
      captured_at_utc: observed.toISOString(),
      source_last_modified_utc: modified.toISOString(),
      source_sha256: atlasSha256(raw),
      compressed_bytes: raw.length,
      all_catalog_entries: parsed.total,
      normal_nse_eq_symbols: Object.keys(parsed.members).length,
      status: "PREMARKET_MEMBERSHIP_ONLY_NO_0940_QUOTE_OR_FILL"
    }
  };
}

function atlasParseCatalog(raw, kind) {
  if (!raw || raw.length < 1000 || raw.length > ATLAS_GAS.maxCompressed[kind] ||
      (raw[0] & 255) !== 31 || (raw[1] & 255) !== 139) {
    throw new Error(kind + " gzip size or signature invalid");
  }
  const compressed = Utilities.newBlob(raw, "application/gzip");
  const plain = Utilities.ungzip(compressed).getDataAsString("UTF-8");
  const unpackedBytes = Utilities.newBlob(plain, "text/plain").getBytes().length;
  if (unpackedBytes > ATLAS_GAS.maxUnpacked[kind]) {
    throw new Error(kind + " unpacked catalog too large");
  }
  const items = JSON.parse(plain);
  if (!Array.isArray(items)) throw new Error(kind + " catalog is not an array");
  const members = Object.create(null);
  items.forEach(function (item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(kind + " catalog contains a non-object");
    }
    if (item.segment !== "NSE_EQ" || item.instrument_type !== "EQ" ||
        item.security_type !== "NORMAL") return;
    const symbol = item.trading_symbol;
    const key = item.instrument_key;
    const isin = item.isin;
    const lot = item.lot_size;
    if (typeof symbol !== "string" || !ATLAS_GAS.symbolPattern.test(symbol) ||
        typeof isin !== "string" || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ||
        typeof key !== "string" || key !== "NSE_EQ|" + isin ||
        !Number.isInteger(lot) || lot !== 1) {
      throw new Error(kind + " has an invalid normal equity identity");
    }
    const identity = { instrument_key: key, isin: isin, lot_size: lot };
    if (members[symbol] && !atlasSameIdentity(members[symbol], identity)) {
      throw new Error(kind + " has a conflicting symbol identity");
    }
    members[symbol] = identity;
  });
  const count = Object.keys(members).length;
  const max = kind === "MIS" ? 4000 : 10000;
  if (count < 500 || count > max) {
    throw new Error(kind + " normal NSE equity count outside bounds");
  }
  return { members: members, total: items.length };
}

function atlasVerifyExisting(folder, session) {
  atlasAssertPrivateFolder(folder);
  const stamp = session.replace(/-/g, "");
  const records = {};
  ["MIS", "BOD"].forEach(function (kind) {
    const manifestName = "NSE_" + kind + "_" + stamp + ".manifest.json";
    const manifestFile = atlasSingleFile(folder, manifestName);
    const record = JSON.parse(manifestFile.getBlob().getDataAsString("UTF-8"));
    const expectedSourceName = "NSE_" + kind + "_" + stamp + ".json.gz";
    if (record.schema !== "atlas.upstox-premarket-source-receipt.v1" ||
        record.session_ist !== session || record.kind !== kind ||
        record.source_file !== expectedSourceName ||
        record.source_url !== ATLAS_GAS.urls[kind] ||
        record.status !== "PREMARKET_MEMBERSHIP_ONLY_NO_0940_QUOTE_OR_FILL" ||
        !/^[0-9a-f]{64}$/.test(record.source_sha256)) {
      throw new Error(kind + " dated receipt schema or identity mismatch");
    }
    const source = atlasSingleFile(folder, expectedSourceName);
    const raw = source.getBlob().getBytes();
    if (raw.length !== record.compressed_bytes) {
      throw new Error(kind + " dated source byte count mismatch");
    }
    const parsed = atlasParseCatalog(raw, kind);
    const modified = new Date(record.source_last_modified_utc);
    const captured = new Date(record.captured_at_utc);
    if (atlasSha256(raw) !== record.source_sha256 ||
        parsed.total !== record.all_catalog_entries ||
        Object.keys(parsed.members).length !== record.normal_nse_eq_symbols ||
        isNaN(modified.getTime()) || isNaN(captured.getTime()) ||
        Utilities.formatDate(modified, ATLAS_GAS.timezone, "yyyy-MM-dd") !== session ||
        Utilities.formatDate(captured, ATLAS_GAS.timezone, "yyyy-MM-dd") !== session ||
        modified.getTime() > captured.getTime()) {
      throw new Error(kind + " dated source integrity or timestamp mismatch");
    }
    records[kind] = { record: record, parsed: parsed };
  });
  Object.keys(records.MIS.parsed.members).forEach(function (symbol) {
    if (!records.BOD.parsed.members[symbol] ||
        !atlasSameIdentity(records.MIS.parsed.members[symbol],
          records.BOD.parsed.members[symbol])) {
      throw new Error("MIS identity absent or different in dated BOD");
    }
  });

  const csvName = stamp + "_mis_universe.csv";
  const csvFile = atlasSingleFile(folder, csvName);
  const csv = atlasMisCsv(session, records.MIS.parsed.members);
  const csvHash = atlasSha256(Utilities.newBlob(csv, "text/csv").getBytes());
  if (csvFile.getBlob().getDataAsString("UTF-8") !== csv) {
    throw new Error("existing derived MIS CSV content mismatch");
  }
  const csvManifest = JSON.parse(
    atlasSingleFile(folder, stamp + "_mis_universe.manifest.json")
      .getBlob().getDataAsString("UTF-8")
  );
  if (csvManifest.schema !== "atlas.upstox-mis-universe.v1" ||
      csvManifest.session_ist !== session ||
      csvManifest.source_sha256 !== records.MIS.record.source_sha256 ||
      csvManifest.source_last_modified_utc !== records.MIS.record.source_last_modified_utc ||
      csvManifest.captured_at_utc !== records.MIS.record.captured_at_utc ||
      csvManifest.csv_sha256 !== csvHash ||
      csvManifest.symbol_count !== Object.keys(records.MIS.parsed.members).length) {
    throw new Error("existing derived MIS manifest mismatch");
  }
  return {
    status: "VERIFIED_EXISTING",
    session_ist: session,
    mis_symbols: Object.keys(records.MIS.parsed.members).length,
    bod_symbols: Object.keys(records.BOD.parsed.members).length,
    mis_sha256: records.MIS.record.source_sha256,
    bod_sha256: records.BOD.record.source_sha256,
    derived_csv_sha256: csvHash,
    evidence_class: "PREMARKET_MEMBERSHIP_ONLY"
  };
}

function atlasArchiveRoot() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(ATLAS_GAS.folderProperty);
  if (savedId) return DriveApp.getFolderById(savedId);
  const matches = DriveApp.getFoldersByName(ATLAS_GAS.folderName);
  if (matches.hasNext()) {
    const folder = matches.next();
    if (matches.hasNext()) throw new Error("ambiguous Atlas archive root folders");
    properties.setProperty(ATLAS_GAS.folderProperty, folder.getId());
    return folder;
  }
  const folder = DriveApp.createFolder(ATLAS_GAS.folderName);
  folder.setDescription("Private Atlas source receipts. No public sharing.");
  properties.setProperty(ATLAS_GAS.folderProperty, folder.getId());
  return folder;
}

function atlasFoldersNamed(parent, name) {
  const result = [];
  const folders = parent.getFoldersByName(name);
  while (folders.hasNext()) result.push(folders.next());
  return result;
}

function atlasSingleFile(folder, name) {
  const files = folder.getFilesByName(name);
  if (!files.hasNext()) throw new Error("required archive file is missing: " + name);
  const found = files.next();
  if (files.hasNext()) throw new Error("duplicate archive file: " + name);
  return found;
}

function atlasAssertPrivateFolder(folder) {
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) {
    throw new Error("archive folder has broad link/domain access; refusing to use it");
  }
}

function atlasAssertDriveHeadroom(requiredBytes) {
  const limit = DriveApp.getStorageLimit();
  const used = DriveApp.getStorageUsed();
  if (!Number.isFinite(limit) || !Number.isFinite(used) ||
      limit <= used || (limit - used) < requiredBytes + 1048576) {
    throw new Error("Drive free-storage headroom is insufficient; no archive files will be published");
  }
}

function atlasHeader(headers, soughtName) {
  const wanted = soughtName.toLowerCase();
  const keys = Object.keys(headers || {});
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === wanted) return String(headers[keys[i]]);
  }
  return "";
}

function atlasSameIdentity(a, b) {
  return a.instrument_key === b.instrument_key &&
    a.isin === b.isin && a.lot_size === b.lot_size;
}

function atlasMisCsv(session, members) {
  const lines = ["session_ist,symbol,instrument_key,isin,lot_size,security_type"];
  Object.keys(members).sort().forEach(function (symbol) {
    const identity = members[symbol];
    lines.push([
      session, symbol, identity.instrument_key, identity.isin,
      String(identity.lot_size), "NORMAL"
    ].join(","));
  });
  return lines.join("\n") + "\n";
}

function atlasSha256(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (value) {
      return ((value & 255) + 256).toString(16).slice(-2);
    }).join("");
}
