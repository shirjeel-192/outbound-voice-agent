// Derive a lead's local timezone from the area code of a +1 (NANP) number. An offline table lookup.
//
// Two rules matter more than coverage.
//   1. Unknown returns null, never a default. A wrong zone is worse than a missing one because it
//      is silently actionable. A California number filed as Eastern gets rung at 06:00 local.
//   2. Area codes that straddle a zone boundary get their majority zone. The residual error is one
//      hour, which is safe inside any sane calling window. The multi-hour errors (Hawaii, Alaska,
//      Pacific) are unambiguous by area code.
//
// Arizona is why this is keyed on area code rather than state. Most of it skips DST, so
// America/Phoenix and America/Denver differ for half the year.

const ZONES: Record<string, string[]> = {
  "America/New_York": [
    "201", "202", "203", "207", "212", "215", "216", "220", "223", "227", "229", "231", "234",
    "239", "240", "248", "252", "260", "267", "272", "276", "301", "302", "304", "305", "313",
    "315", "317", "321", "326", "330", "332", "336", "339", "340", "347", "351", "352", "364",
    "380", "386", "401", "404", "407", "410", "412", "413", "419", "423", "434", "440", "443",
    "445", "463", "464", "470", "475", "478", "484", "502", "508", "513", "516", "517", "518",
    "540", "551", "561", "567", "570", "571", "574", "585", "586", "603", "606", "607", "609",
    "610", "614", "616", "617", "631", "640", "645", "646", "667", "678", "680", "681", "689",
    "703", "704", "706", "716", "717", "718", "724", "727", "732", "734", "740", "743", "754",
    "757", "762", "765", "770", "771", "772", "774", "781", "786", "802", "803", "804", "810",
    "812", "813", "814", "826", "828", "835", "838", "839", "843", "845", "848", "854", "856",
    "857", "859", "860", "862", "863", "864", "865", "878", "904", "906", "908", "910", "912",
    "914", "917", "919", "929", "930", "934", "937", "941", "943", "945", "947", "948", "954",
    "959", "973", "978", "980", "984", "989",
  ],
  "America/Chicago": [
    "205", "210", "214", "217", "218", "219", "224", "225", "228", "235", "251", "254", "256",
    "262", "270", "274", "281", "308", "309", "312", "314", "316", "318", "319", "320", "325",
    "331", "334", "337", "346", "353", "361", "402", "405", "409", "414", "417", "430", "432",
    "447", "448", "469", "479", "501", "504", "507", "512", "515", "531", "534", "539", "557",
    "563", "573", "580", "601", "605", "608", "612", "615", "618", "620", "621", "629", "630",
    "636", "641", "651", "660", "662", "682", "701", "708", "712", "713", "715", "726", "731",
    "737", "769", "773", "779", "785", "806", "815", "816", "817", "830", "832", "847", "850",
    "870", "872", "901", "903", "913", "918", "920", "931", "936", "940", "952", "956", "972",
    "975", "979", "985",
  ],
  "America/Denver": [
    "208", "303", "307", "385", "406", "435", "505", "575", "719", "720", "801", "915", "970",
    "983", "986",
  ],
  // Arizona does not observe DST. A state- or offset-based map gets this wrong for half the year.
  "America/Phoenix": ["480", "520", "602", "623", "928"],
  "America/Los_Angeles": [
    "206", "209", "213", "253", "279", "310", "323", "341", "350", "360", "369", "408", "415",
    "424", "425", "442", "458", "503", "509", "510", "530", "541", "559", "562", "564", "619",
    "626", "628", "650", "657", "661", "669", "702", "707", "714", "725", "738", "747", "760",
    "775", "805", "818", "820", "831", "840", "858", "909", "916", "925", "949", "951", "971",
  ],
  "America/Anchorage": ["907"],
  "Pacific/Honolulu": ["808"],
  "America/Puerto_Rico": ["787", "939"],
  // Canada. Not TCPA territory, but the CRTC rules are comparable and 08:00–20:00 local is the
  // right courtesy window anywhere — mapping them correctly is less special-casing than excluding.
  "America/Vancouver": ["236", "250", "604", "672", "778"],
  "America/Edmonton": ["368", "403", "587", "780", "825"],
  "America/Regina": ["306", "639"],
  "America/Winnipeg": ["204", "431", "584"],
  "America/Toronto": [
    "226", "249", "263", "289", "343", "354", "365", "367", "382", "416", "418", "437", "438",
    "450", "468", "514", "519", "548", "579", "581", "613", "647", "683", "705", "742", "753",
    "807", "819", "873", "905", "942",
  ],
  "America/Halifax": ["506", "782", "902"],
  "America/St_Johns": ["709"],
  "America/Whitehorse": ["867"],
};

// Toll-free, premium and other non-geographic codes. A number that does not sit in a place has no
// local time to reason about; listing them explicitly documents that the null is deliberate rather
// than a gap in the table.
const NON_GEOGRAPHIC = new Set([
  "800", "833", "844", "855", "866", "877", "888", "822", "880", "881", "882", "889",
  "900", "700", "710", "500", "521", "522", "523", "524", "525", "526", "527", "528",
  "529", "533", "544", "566", "577", "588", "600", "622",
]);

// An area code listed under two zones is a data-entry mistake. Fail at import time instead of
// letting object key order pick a winner.
const BY_AREA_CODE = new Map<string, string>();
for (const [zone, codes] of Object.entries(ZONES)) {
  for (const code of codes) {
    const existing = BY_AREA_CODE.get(code);
    if (existing && existing !== zone) throw new Error(`area code ${code} mapped to both ${existing} and ${zone}`);
    BY_AREA_CODE.set(code, zone);
  }
}

export const ALL_ZONES: readonly string[] = Object.keys(ZONES);

/** IANA zone for a +1 E.164 number, or null when the area code is unknown or non-geographic. */
export function timezoneForPhone(e164: string | null | undefined): string | null {
  const m = /^\+1(\d{3})\d{7}$/.exec(e164?.trim() ?? "");
  if (!m || NON_GEOGRAPHIC.has(m[1])) return null;
  return BY_AREA_CODE.get(m[1]) ?? null;
}
