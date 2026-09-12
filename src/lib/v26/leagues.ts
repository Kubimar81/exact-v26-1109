const HV_LEAGUES = [
  // V26 25.16.1 — Allsvenskan/Szwecja WYŁĄCZONE (HV tylko progi GF+GA/BTTS, nie auto-liga)
  // NIE wolno trzymać gołego "premier division" — łapie Calcutta Premier Division.
  "chile",
  "iceland",
  "islandia",
  "uzbekistan",
  "ireland",
  "irlandia",
  "league of ireland",
  "nifl",
  "northern ireland",
  "romania",
  "rumunia",
  "paraguay",
  "úrvalsdeild",
  "urvalsdeild",
  "besta deild",
  // V26 HV ligi poza 25.16.1 (oficjalny filtr, nie Ekstraklasa / nie Allsvenskan / nie Calcutta)
  "serie b",
  "serie c",
  "botola",
  "morocco",
  "maroko",
  "greece",
  "grecja",
  "super league greece",
  "turkey",
  "turcja",
  "süper lig",
  "super lig",
  "egypt",
  "egipt",
  "premier league egypt",
  "tunisia",
  "tunezja",
  "usl",
  "argentina b",
  "primera nacional",
  "esiliiga",
  "meistriliiga",
];

const MEDIUM_VARIANCE = [
  "veikkausliiga",
  "finland",
  "finlandia",
];

const UGO_PLUS = ["botola", "egypt", "egipt", "tunisia", "tunezja", "greece", "grecja", "turkey", "turcja"];

/** Ligi, które wyglądają jak HV (słowo Premier Division), a V26 ich nie ma na liście. */
const HV_EXCLUDE = [
  "calcutta",
  "kolkata",
  "i-league",
  "indian super",
  "isl",
  "mizoram",
  "ekstraklasa",
  "allsvenskan",
];

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function hvTokenHit(leagueNorm: string, key: string): boolean {
  const k = norm(key);
  if (!k) return false;
  if (k.length <= 4) {
    return new RegExp(`(?:^|[^a-z0-9])${k}(?:[^a-z0-9]|$)`).test(leagueNorm);
  }
  return leagueNorm.includes(k);
}

export function isHighVarianceLeague(league: string): boolean {
  const n = norm(league);
  if (!n) return false;
  if (HV_EXCLUDE.some((k) => hvTokenHit(n, k))) return false;
  return HV_LEAGUES.some((k) => hvTokenHit(n, k));
}

export function isMediumVarianceLeague(league: string): boolean {
  const n = norm(league);
  return MEDIUM_VARIANCE.some((k) => n.includes(k));
}

export function isUgoPlusLeague(league: string): boolean {
  const n = norm(league);
  return UGO_PLUS.some((k) => n.includes(k));
}

export function isVeikkausliiga(league: string): boolean {
  const n = norm(league);
  if (/ykkonen|ykkos/.test(n)) return false;
  return n.includes("veikkaus") || n.includes("finland");
}

export function isAllsvenskan(league: string): boolean {
  const n = norm(league);
  if (/superettan/.test(n)) return false;
  return n.includes("allsvenskan") || n.includes("szwecja") || n.includes("sweden");
}

export function isSuperettan(league: string): boolean {
  return /superettan/.test(norm(league));
}

/**
 * Klub → liga, gdy OBA składy wskazują to samo.
 * Formularz ma default Ekstraklasa — Brøndby/Silkeborg nie mogą iść na id 106.
 * Tokeny ≥5 znaków, bez united/city/police (homonimy).
 */
const CLUB_LEAGUE: [string, string][] = [
  ["brondby", "Superliga Denmark"],
  ["broendby", "Superliga Denmark"],
  ["silkeborg", "Superliga Denmark"],
  ["midtjylland", "Superliga Denmark"],
  ["nordsjaelland", "Superliga Denmark"],
  ["nordsjalland", "Superliga Denmark"],
  ["kobenhavn", "Superliga Denmark"],
  ["copenhagen", "Superliga Denmark"],
  ["randers", "Superliga Denmark"],
  ["viborg", "Superliga Denmark"],
  ["lyngby", "Superliga Denmark"],
  ["sonderjysk", "Superliga Denmark"],
  ["aarhus", "Superliga Denmark"],
  ["odense", "Superliga Denmark"],
  ["norrkoping", "Superettan"],
  ["falkenberg", "Superettan"],
  ["malmo", "Allsvenskan"],
  ["djurgarden", "Allsvenskan"],
  ["hammarby", "Allsvenskan"],
  ["orgryte", "Allsvenskan"],
  ["lask", "Austrian Bundesliga"],
  ["altach", "Austrian Bundesliga"],
  ["jagiellonia", "Ekstraklasa"],
  ["bialystok", "Ekstraklasa"],
  ["slask", "Ekstraklasa"],
  ["wroclaw", "Ekstraklasa"],
  ["rakow", "Ekstraklasa"],
  ["czestochowa", "Ekstraklasa"],
  ["poznan", "Ekstraklasa"],
  ["zabrze", "Ekstraklasa"],
  ["cracovia", "Ekstraklasa"],
  ["gornikzabrze", "Ekstraklasa"],
  ["widzew", "Ekstraklasa"],
  ["radomiak", "Ekstraklasa"],
  ["pogon", "Ekstraklasa"],
  ["piast", "Ekstraklasa"],
  ["korona", "Ekstraklasa"],
  ["wieczysta", "Ekstraklasa"],
  ["zaglebie", "Ekstraklasa"],
  ["aalborg", "1. Division Denmark"],
  ["koge", "1. Division Denmark"],
  ["nublense", "Chile Primera División"],
  ["concepcion", "Chile Primera División"],
  ["huachipato", "Chile Primera División"],
  ["colocolo", "Chile Primera División"],
  ["antofagasta", "Chile Primera B"],
  ["cobreloa", "Chile Primera B"],
  ["ontustyk", "Kazakhstan First League"],
  ["ontustik", "Kazakhstan First League"],
  ["aktobeii", "Kazakhstan First League"],
  ["aktobe2", "Kazakhstan First League"],
  ["tobol", "Kazakhstan Premier League"],
  ["kostanay", "Kazakhstan Premier League"],
  ["kairat", "Kazakhstan Premier League"],
  ["ordabasy", "Kazakhstan Premier League"],
  ["aktobe", "Kazakhstan Premier League"],
  ["yelimay", "Kazakhstan Premier League"],
  ["atyrau", "Kazakhstan Premier League"],
  ["kaisar", "Kazakhstan Premier League"],
  ["kyzylzhar", "Kazakhstan Premier League"],
  ["zhenis", "Kazakhstan Premier League"],
  ["okzhetpes", "Kazakhstan Premier League"],
  ["liepaja", "Virsliga"],
  ["valmiera", "Virsliga"],
  ["daugavpils", "Virsliga"],
  ["grobinas", "Virsliga"],
  ["tukums", "Virsliga"],
  ["jelgava", "Virsliga"],
  ["ettifaq", "Saudi Pro League"],
  ["nassr", "Saudi Pro League"],
  ["hilal", "Saudi Pro League"],
  ["khaleej", "Saudi Pro League"],
  ["fayha", "Saudi Pro League"],
  ["qadsiah", "Saudi Pro League"],
  ["qadisiyah", "Saudi Pro League"],
  ["diriyah", "Saudi Pro League"],
  ["draih", "Saudi Pro League"],
  ["diriah", "Saudi Pro League"],
  ["drah", "Saudi Pro League"],
  ["bursaspor", "TFF 1. Lig"],
  ["istanbulspor", "TFF 1. Lig"],
  ["hibernian", "Scottish Premiership"],
  ["hearts", "Scottish Premiership"],
  ["midlothian", "Scottish Premiership"],
  ["madryn", "Primera Nacional"],
  ["godoy", "Primera Nacional"],
  ["barracas", "Liga Profesional Argentina"],
  ["argentinos", "Liga Profesional Argentina"],
  ["instituto", "Liga Profesional Argentina"],
  ["santafe", "Liga Profesional Argentina"],
  ["stromsgodset", "1. Division Norway"],
  ["stromgodset", "1. Division Norway"],
  ["hodd", "1. Division Norway"],
  ["ranheim", "1. Division Norway"],
  ["stabaek", "1. Division Norway"],
  ["stabak", "1. Division Norway"],
  ["haugesund", "1. Division Norway"],
  ["ballklubb", "1. Division Norway"],
  ["sogndal", "1. Division Norway"],
  ["bryne", "1. Division Norway"],
  ["kongsvinger", "1. Division Norway"],
  ["sandnes", "1. Division Norway"],
  ["strommen", "1. Division Norway"],
  ["asane", "1. Division Norway"],
  ["raufoss", "1. Division Norway"],
  ["egersund", "1. Division Norway"],
  ["moss", "1. Division Norway"],
  ["palmeiras", "Brasileirão Série A"],
  ["mirassol", "Brasileirão Série A"],
  ["flamengo", "Brasileirão Série A"],
  ["fluminense", "Brasileirão Série A"],
  ["botafogo", "Brasileirão Série A"],
  ["corinthians", "Brasileirão Série A"],
  ["bragantino", "Brasileirão Série A"],
  ["saopaulo", "Brasileirão Série A"],
  ["gremio", "Brasileirão Série A"],
  ["internacional", "Brasileirão Série A"],
  ["cruzeiro", "Brasileirão Série A"],
  ["fortaleza", "Brasileirão Série A"],
  ["paranaense", "Brasileirão Série A"],
  ["mineiro", "Brasileirão Série A"],
  ["juventude", "Brasileirão Série A"],
  ["cuiaba", "Brasileirão Série A"],
  ["vasco", "Brasileirão Série A"],
  ["santos", "Brasileirão Série A"],
  ["bahia", "Brasileirão Série A"],
  ["ceara", "Brasileirão Série A"],
  ["sportrecife", "Brasileirão Série A"],
  ["qarabag", "Azerbaijan Premier League"],
  ["karabakh", "Azerbaijan Premier League"],
  ["sumgayit", "Azerbaijan Premier League"],
  ["sumqayit", "Azerbaijan Premier League"],
  ["sumgait", "Azerbaijan Premier League"],
  ["nakhchivan", "Azerbaijan Premier League"],
  ["naxcivan", "Azerbaijan Premier League"],
  ["naxciwan", "Azerbaijan Premier League"],
  ["araz", "Azerbaijan Premier League"],
  ["sabah", "Azerbaijan Premier League"],
  ["neftchi", "Azerbaijan Premier League"],
  ["neftci", "Azerbaijan Premier League"],
  ["kapaz", "Azerbaijan Premier League"],
  ["qabala", "Azerbaijan Premier League"],
  ["gabala", "Azerbaijan Premier League"],
  ["shamakhi", "Azerbaijan Premier League"],
  ["semaxi", "Azerbaijan Premier League"],
  ["sabail", "Azerbaijan Premier League"],
  ["tovuz", "Azerbaijan Premier League"],
  ["imisli", "Azerbaijan Premier League"],
  ["karvan", "Azerbaijan Premier League"],
  ["difai", "Azerbaijan Premier League"],
  ["flinttown", "Cymru Premier"],
  ["connah", "Cymru Premier"],
  ["nomads", "Cymru Premier"],
  ["penybont", "Cymru Premier"],
  ["caernarfon", "Cymru Premier"],
  ["haverfordwest", "Cymru Premier"],
  ["britonferry", "Cymru Premier"],
  ["colwyn", "Cymru Premier"],
  ["thenewsaints", "Cymru Premier"],
  ["newsaints", "Cymru Premier"],
  ["cardiffmet", "Cymru Premier"],
  ["barrytown", "Cymru Premier"],
  ["balatown", "Cymru Premier"],
  ["llandudno", "Cymru Premier"],
  ["airbus", "Cymru Premier"],
  ["holywell", "Cymru Premier"],
  ["newtownafc", "Cymru Premier"],
  ["llanelli", "Cymru Premier"],
  ["ardakardzhali", "Parva Liga"],
  ["kardzhali", "Parva Liga"],
  ["kardjali", "Parva Liga"],
  ["botevvratsa", "Parva Liga"],
  ["vratsa", "Parva Liga"],
  ["ludogorets", "Parva Liga"],
  ["levskisofia", "Parva Liga"],
  ["cska1948", "Parva Liga"],
  ["cskasofia", "Parva Liga"],
  ["chernomore", "Parva Liga"],
  ["slaviasofia", "Parva Liga"],
  ["lokomotivplovdiv", "Parva Liga"],
  ["lokomotivsofia", "Parva Liga"],
  ["septemvri", "Parva Liga"],
  ["spartakvarna", "Parva Liga"],
  ["dunavruse", "Parva Liga"],
  ["botevplovdiv", "Parva Liga"],
  ["beroe", "Parva Liga"],
  ["hajduksplit", "HNL"],
  ["hajduk", "HNL"],
  ["lokomotivazagreb", "HNL"],
  ["lokomotiva", "HNL"],
  ["dinamozagreb", "HNL"],
  ["hnkrijeka", "HNL"],
  ["osijek", "HNL"],
  ["istra1961", "HNL"],
  ["slavenbelupo", "HNL"],
  ["hnkgorica", "HNL"],
  ["varazdin", "HNL"],
  ["vukovar", "HNL"],
  ["lugazi", "Uganda Premier League"],
  ["necfc", "Uganda Premier League"],
  ["zrinjski", "Premijer Liga"],
  ["bskbanjaluka", "Premijer Liga"],
  ["boracbanjaluka", "Premijer Liga"],
  ["sirokibrijeg", "Premijer Liga"],
  ["zeljeznicar", "Premijer Liga"],
  ["jabalain", "Saudi First Division"],
  ["alnajma", "Saudi First Division"],
  ["beersheva", "Ligat Ha'Al"],
  ["beersheba", "Ligat Ha'Al"],
  ["hapoelhaifa", "Ligat Ha'Al"],
  ["maccabihaifa", "Ligat Ha'Al"],
  ["maccabitelaviv", "Ligat Ha'Al"],
  ["beitarjerusalem", "Ligat Ha'Al"],
  ["beitar", "Ligat Ha'Al"],
  ["sakhnin", "Ligat Ha'Al"],
  ["dinamobrest", "Belarus Premier League"],
  ["dynamobrest", "Belarus Premier League"],
  ["bateborisov", "Belarus Premier League"],
  ["bateborysow", "Belarus Premier League"],
  ["bate", "Belarus Premier League"],
  ["kiryatshmona", "Ligat Ha'Al"],
  ["hapoeljerusalem", "Ligat Ha'Al"],
  ["maccabinetanya", "Ligat Ha'Al"],
  ["netanya", "Ligat Ha'Al"],
  ["tiberias", "Ligat Ha'Al"],
  ["ashdod", "Ligat Ha'Al"],
  ["hapoeltelaviv", "Ligat Ha'Al"],
  ["petahtikva", "Ligat Ha'Al"],
  ["bneiraine", "Ligat Ha'Al"],
  ["maccabibneiraine", "Ligat Ha'Al"],
  ["pakhtakor", "Uzbekistan Super League"],
  ["andijan", "Uzbekistan Super League"],
  ["andijon", "Uzbekistan Super League"],
  ["bunyodkor", "Uzbekistan Super League"],
  ["nasaf", "Uzbekistan Super League"],
  ["navbahor", "Uzbekistan Super League"],
  ["citytorque", "Uruguay Primera División"],
  ["torque", "Uruguay Primera División"],
  ["cerrolargo", "Uruguay Primera División"],
  ["danubio", "Uruguay Primera División"],
  ["penarol", "Uruguay Primera División"],
  ["novipazar", "Serbia Super Liga"],
  ["pancevo", "Serbia Super Liga"],
  ["zeleznicarpancevo", "Serbia Super Liga"],
  ["backatopola", "Serbia Super Liga"],
  ["taborsko", "Czech FNL"],
  ["vlasim", "Czech FNL"],
  ["silon", "Czech FNL"],
  ["trinec", "Czech FNL"],
  ["kladno", "Czech FNL"],
  ["fcjazz", "Ykkönen"],
  ["jazz", "Ykkönen"],
  ["kpv", "Ykkönen"],
  ["kokkola", "Ykkönen"],
  ["lausanneouchy", "Swiss Challenge League"],
  ["stadelausanne", "Swiss Challenge League"],
  ["fcwil", "Swiss Challenge League"],
  ["wil1900", "Swiss Challenge League"],
  ["wil", "Swiss Challenge League"],
  // Mizoram Premier League (Indie, 5. poziom) — OCR „Premier League” ≠ EPL.
  // Tokeny unikalne; nie: mls / police / kanan / aizawl (homonimy ISL/I-League/MLS).
  ["mizoram", "Mizoram Premier League"],
  ["lawngtlai", "Mizoram Premier League"],
  ["lawtngtlai", "Mizoram Premier League"],
  ["chanmari", "Mizoram Premier League"],
  ["dinthar", "Mizoram Premier League"],
  ["saikhamakawn", "Mizoram Premier League"],
  ["ramthar", "Mizoram Premier League"],
  // Egipt Premier League — OCR „Premier League” ≠ EPL. Tokeny unikalne (nie: united/city).
  ["zamalek", "Egyptian Premier League"],
  ["abuqair", "Egyptian Premier League"],
  ["aboqair", "Egyptian Premier League"],
  ["abuqir", "Egyptian Premier League"],
  ["aboqir", "Egyptian Premier League"],
  ["semads", "Egyptian Premier League"],
  // NIFL Premiership — OCR „Premiership” ≠ Szkocja (id 179). bangorfc, nie goły bangor (Cymru).
  ["larne", "NIFL Premiership"],
  ["bangorfc", "NIFL Premiership"],
  ["linfield", "NIFL Premiership"],
  ["glentoran", "NIFL Premiership"],
  ["cliftonville", "NIFL Premiership"],
  // Kolumbia Primera B — OCR bukmachera „Columbia” ≠ Chile 266 / Argentyna 131.
  ["yumbo", "Colombia Primera B"],
  ["quindio", "Colombia Primera B"],
  ["patriotas", "Colombia Primera B"],
  ["barranquilla", "Colombia Primera B"],
  // Wietnam / Tajlandia / Singapur — OCR „Premier League” ≠ EPL 39.
  ["ninhbinh", "V-League"],
  ["thanhhoa", "V-League"],
  ["thanhoa", "V-League"],
  ["lamphun", "Thai League 1"],
  ["buriram", "Thai League 1"],
  ["muangthong", "Thai League 1"],
  ["portfc", "Thai League 1"],
  ["tampines", "Singapore Premier League"],
  ["balestier", "Singapore Premier League"],
  ["khalsa", "Singapore Premier League"],
  ["poloniawarszawa", "I Liga"],
  ["poloniabytom", "I Liga"],
  ["bytom", "I Liga"],
  ["chrobtyglogow", "I Liga"],
  ["chrobry", "I Liga"],
  ["pogonsiedlce", "I Liga"],
  ["siedlce", "I Liga"],
  ["ruchchorzow", "I Liga"],
  ["podbeskidzie", "I Liga"],
];

function clubLeague(name: string): string | null {
  const folded = fold(name).replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/ı/g, "i");
  const words = folded.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const compact = words.join("");
  if (!compact) return null;
  if (/aktobe(ii|2|b)$/.test(compact) || compact.includes("ontustyk") || compact.includes("ontustik")) return "Kazakhstan First League";
  let hit: string | null = null;
  for (const [token, league] of CLUB_LEAGUE) {
    const t = token.replace(/[^a-z0-9]+/g, "");
    if (!t) continue;
    // Słowo, nie podciąg: „lask” ≠ „Śląsk” (slask). LASK Linz zostaje.
    const wordHit = words.some((w) => w === t || (t.length >= 6 && w.startsWith(t)));
    const compactHit = compact === t || (t.length >= 6 && compact.includes(t)) || (t.length >= 4 && compact.startsWith(t));
    if (!wordHit && !compactHit) continue;
    if (hit && hit !== league) return null;
    hit = league;
  }
  return hit;
}

const GENERIC_HINT = /^(ekstraklasa|inna liga)?$/;
/** OCR bez kraju: „Süper Lig” / „Super League” / „Primera Division”. */
const AMBIGUOUS_HINT = /^(super lig|super liga|super league|primera division|primera)$/;

/** Liga z tokenów klubów (oba zgodne, albo jeden gdy drugi milczy). */
export function leagueHintFromClubs(home: string, away: string): string | null {
  const h = clubLeague(home);
  const a = clubLeague(away);
  if (h && a) return h === a ? h : null;
  return h || a;
}

/** Gdy oba kluby wskazują tę samą ligę, nadpisz default Ekstraklasa / złą listę. */
export function resolveLeague(home: string, away: string, hinted?: string): string {
  const mapped = matchLeague(hinted || "");
  const fromClubs = leagueHintFromClubs(home, away);
  if (fromClubs) {
    const m = fold(mapped);
    const both = Boolean(clubLeague(home) && clubLeague(away) && clubLeague(home) === clubLeague(away));
    if (both && (GENERIC_HINT.test(m) || m !== fold(fromClubs))) return fromClubs;
    if (!both && (GENERIC_HINT.test(m) || AMBIGUOUS_HINT.test(m))) return fromClubs;
  }
  return mapped || hinted?.trim() || "Inna liga";
}

function fold(s: string) {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/đ/g, "d")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/ß/g, "ss")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Polskie egzonimy miast → nazwa w składzie API-Football (Marsylia ≠ Marseille to 4 edycje). */
export const CITY_EXONYMS: Record<string, string> = {
  marsylia: "marseille",
  mediolan: "milan",
  neapol: "napoli",
  turyn: "torino",
  rzym: "roma",
  monachium: "munich",
  kolonia: "koln",
  sewilla: "sevilla",
  walencja: "valencia",
  lizbona: "lisboa",
  strasburg: "strasbourg",
  antwerpia: "antwerp",
  bruksela: "brussels",
  kopenhaga: "copenhagen",
  wieden: "wien",
  ateny: "athens",
  paryz: "paris",
  londyn: "london",
  norymberga: "nurnberg",
  wenecja: "venezia",
  genua: "genoa",
  florencja: "firenze",
  lyonnais: "lyon",
  wolves: "wolverhampton",
  praga: "praha",
  bukareszt: "bucuresti",
};

export function applyCityExonyms(s: string): string {
  return s
    .split(/\s+/)
    .map((t) => CITY_EXONYMS[t] || t)
    .filter(Boolean)
    .join(" ");
}

const CLUB_STOP = new Set(["fc", "sc", "ac", "afc", "cf", "if", "ff", "fk", "fa", "bk", "sk", "club", "the", "de", "al", "el", "baku", "sofia", "r", "ii", "iii", "res", "reserve", "reserves", "olympique", "deportes", "deporte", "independiente", "universidad"]);

/** 1948 rozdziela CSKA 1948 od CSKA. Rok założenia (1900, 1912, 1961) nie jest rozróżnikiem. */
const DISTINGUISH_YEARS = new Set(["1948"]);

export function clubYearConflict(found: string, wanted: string): boolean {
  const years = (s: string) => s.match(/\b(19|20)\d{2}\b/g) || [];
  const ya = years(found);
  const yb = years(wanted);
  if (ya.join() === yb.join()) return false;
  if (ya.length && yb.length) return true;
  return [...ya, ...yb].some((y) => DISTINGUISH_YEARS.has(y));
}

function tokenDist(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

export function clubNameMatches(found: string, wanted: string): boolean {
  const ocr = (s: string) => {
    let t = s
      .replace(/\babo\b/g, "abu")
      .replace(/\bqir\b/g, "qair")
      .replace(/\bsemads\b/g, "semad")
      .replace(/\blawtngtlai\b/g, "lawngtlai")
      .replace(/\bqadsiah\b/g, "qadisiyah")
      .replace(/\bqadisiya\b/g, "qadisiyah")
      .replace(/\bdraih\b/g, "diriyah")
      .replace(/\bdiriah\b/g, "diriyah")
      .replace(/\bdireyah\b/g, "diriyah")
      .replace(/\bdrah\b/g, "diriyah");
    if (/\bmizoram\b|\blawngtlai\b|\blawtngtlai\b/.test(t)) t = t.replace(/\bmis\b/g, "mls");
    return t;
  };
  const a = ocr(applyCityExonyms(fold(found).replace(/[^a-z0-9]+/g, " ").trim()));
  const b = ocr(applyCityExonyms(fold(wanted).replace(/[^a-z0-9]+/g, " ").trim()));
  if (!a || !b) return false;
  if (clubYearConflict(found, wanted)) return false;
  const isQpr = (s: string) => {
    const c = s.replace(/\s+/g, "");
    if (c === "qpr") return true;
    return /\bqueens?\b/.test(s) && /\bpark\b/.test(s) && /\brangers\b/.test(s);
  };
  if (isQpr(a) && isQpr(b)) return true;
  if (isQpr(a) !== isQpr(b)) {
    const scottish = (s: string) => /\bqueens?\b/.test(s) && /\bpark\b/.test(s) && !/\brangers\b/.test(s) && s.replace(/\s+/g, "") !== "qpr";
    if (scottish(a) || scottish(b)) return false;
  }
  const isPsg = (s: string) => {
    const c = s.replace(/\s+/g, "");
    if (c === "psg") return true;
    return /\bparis\b/.test(s) && /\bsaint\b/.test(s) && /\bgermain\b/.test(s);
  };
  if (isPsg(a) && isPsg(b)) return true;
  const foreign = ["manchester", "rwanda", "bayern", "tero", "usl", "bangkok", "jong"];
  if (foreign.some((f) => a.includes(f) && !b.includes(f))) return false;
  if (a === b) return true;
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  const az = (s: string) => s.replace(/q/g, "g");
  if (compactA.length >= 5 && compactB.length >= 5) {
    if (compactA === compactB || az(compactA) === az(compactB)) return true;
    if (compactA.includes(compactB) || compactB.includes(compactA)) return true;
  }
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 4) return true;
  const tokens = (s: string) => new Set(s.split(" ").filter((t) => t.length >= 3 && !CLUB_STOP.has(t)));
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) {
    const stripped = (s: string) => s.split(" ").filter((t) => !CLUB_STOP.has(t)).join(" ");
    return stripped(a) === stripped(b) && stripped(a).length >= 4;
  }
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  if (hit >= 1) {
    const extraA = [...ta].filter((t) => !tb.has(t) && t.length >= 4 && !/^(19|20)\d{2}$/.test(t));
    const extraB = [...tb].filter((t) => !ta.has(t) && t.length >= 4 && !/^(19|20)\d{2}$/.test(t));
    if (extraA.length && extraB.length) return false;
    return true;
  }
  const stem = (t: string) => (t.length >= 5 && t.endsWith("s") ? t.slice(0, -1) : t);
  for (const t of ta) {
    const st = stem(t);
    if (st.length >= 4 && [...tb].some((u) => stem(u) === st)) return true;
  }
  const arab = (s: string) =>
    s
      .replace(/iyyah/g, "ia")
      .replace(/iyah/g, "ia")
      .replace(/aih/g, "ia")
      .replace(/iah/g, "ia")
      .replace(/iy/g, "i")
      .replace(/ai/g, "i");
  const ca = arab(compactA);
  const cb = arab(compactB);
  if (Math.min(ca.length, cb.length) >= 4 && Math.max(ca.length, cb.length) >= 5) {
    if (ca === cb || (Math.min(ca.length, cb.length) >= 5 && (ca.includes(cb) || cb.includes(ca)))) return true;
    const dArab = tokenDist(ca, cb);
    if (dArab <= 1) return true;
  }
  const la = [...ta].sort((x, y) => y.length - x.length)[0] || "";
  const lb = [...tb].sort((x, y) => y.length - x.length)[0] || "";
  if (la.length >= 6 && lb.length >= 6) {
    const d = tokenDist(la, lb);
    if (d <= 2 && d / Math.max(la.length, lb.length) <= 0.22) return true;
  }
  return false;
}

const SOURCE_KEEP = [
  "api-football",
  "api-sports.io",
  "open-meteo",
  "met.no",
  "flashscore",
  "sofascore",
  "fotmob",
  "transfermarkt",
  "footystats",
  "fbref",
  "totalcorner",
  "oddalerts",
];

const SOURCE_REJECT: { re: RegExp; unlessLeague: RegExp }[] = [
  { re: /manchester[- ]united|manutd|premierleague\.com/i, unlessLeague: /premier league|\bepl\b|england|angli/i },
  { re: /usl[- ]?(league|championship)|uslleaguetwo/i, unlessLeague: /\busl\b/i },
  { re: /rwanda|azam-sports|ferwafa/i, unlessLeague: /rwanda/i },
  { re: /police[- ]tero|thai[- ]league/i, unlessLeague: /thai|tajland/i },
  { re: /bayern|fcbayern|bundesliga\.de/i, unlessLeague: /bundesliga|germany|niemc/i },
];

/** Zostaw URL-e ligi/klubu. Odrzuć homonimy z innego kraju. */
export function filterMatchSources(urls: string[], home: string, away: string, league: string): string[] {
  const lg = fold(league);
  const h = fold(home);
  const a = fold(away);
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || typeof raw !== "string") continue;
    const u = raw.trim();
    if (!/^https?:\/\//i.test(u) && !u.startsWith("api-football")) continue;
    if (SOURCE_REJECT.some((row) => row.re.test(u) && !row.unlessLeague.test(lg))) continue;
    const keepHost = SOURCE_KEEP.some((k) => u.toLowerCase().includes(k));
    const mentionsTeam = (h && u.toLowerCase().includes(h.split(" ")[0] || "___")) || (a && u.toLowerCase().includes(a.split(" ")[0] || "___"));
    const mentionsLeague = lg && u.toLowerCase().includes(lg.split(" ").find((t) => t.length >= 5) || "___");
    if (keepHost || mentionsTeam || mentionsLeague || u.startsWith("api-football")) out.push(u);
  }
  return [...new Set(out)];
}

export function matchLeague(raw: string): string {
  const n = fold(raw.trim());
  if (!n) return "Inna liga";
  // Kraj z nagłówka bukmachera ma pierwszeństwo (Superbet: „Rumunia - SuperLiga”).
  if (/\bcalcutt|\bkolkata|\bcfl\b/.test(n)) return "Calcutta Premier Division";
  if (/\bmizoram\b|lawngtlai|lawtngtlai/.test(n)) return "Mizoram Premier League";
  if (/\begipt\b|\begypt\b|\begyptian\b/.test(n)) return "Egyptian Premier League";
  if (/wietnam|\bvietnam\b|v[- ]?league/.test(n)) return "V-League";
  if (/tajland|\bthailand\b|thai league/.test(n)) return "Thai League 1";
  if (/singapur|\bsingapore\b/.test(n)) return "Singapore Premier League";
  if (/(^|\s)i liga(\s|$)|fortuna 1 liga/.test(n) && !/rumun|romania/.test(n)) return "I Liga";
  if (/\bnifl\b|northern ireland|irlandia polnoc|polnocn\w* irland/.test(n)) return "NIFL Premiership";
  if (/\bsuperettan\b/.test(n)) return "Superettan";
  if (/\brumun|\bromania\b/.test(n)) return "Liga I Romania";
  if (/\bholand|\bnether|\bholland\b|\beredivisie\b/.test(n)) return "Eredivisie";
  if (/\bszwec|\bsweden\b|\ballsven/.test(n)) return "Allsvenskan";
  if (/\bdania\b|\bdenmark\b/.test(n) && /1\.?\s*division/.test(n)) return "1. Division Denmark";
  if (/\bdania\b|\bdenmark\b/.test(n) && /superliga/.test(n)) return "Superliga Denmark";
  if (/(austri|osterreich|österreich)/.test(n) && /bundesliga/.test(n)) return "Austrian Bundesliga";
  if (/\bcolombi|\bcolumbia\b|\bkolumbi/.test(n)) {
    if (/primera b|torneo betplay/.test(n)) return "Colombia Primera B";
    return "Colombia Primera A";
  }
  if (/\bchile\b/.test(n) && !/urugw|uruguay/.test(n)) {
    if (/primera b/.test(n)) return "Chile Primera B";
    return "Chile Primera División";
  }
  if (/uzbek/.test(n)) return "Uzbekistan Super League";
  if (/urugw|uruguay/.test(n)) return "Uruguay Primera División";
  if (/\bserb/.test(n) && /super|liga/.test(n)) return "Serbia Super Liga";
  if (/\bfnl\b|chl[- ]?fnl/.test(n)) return "Czech FNL";
  if (/challenge league/.test(n)) return "Swiss Challenge League";
  if (/ykkonen|ykkosliiga|ykkos[- ]?liiga/.test(n)) return "Ykkönen";
  if (/veikkaus/.test(n)) return "Veikkausliiga";
  if (/laliga\s*2|la liga 2|laliga2/.test(n)) return "Segunda División";
  if (/segunda/.test(n) && /(hiszpan|spain|laliga|la liga)/.test(n)) return "Segunda División";
  if (/\bkazachstan|\bkazakhstan\b/.test(n)) {
    if (/first|1\s*(liga|league|division)|pervaya/.test(n)) return "Kazakhstan First League";
    return "Kazakhstan Premier League";
  }
  if (/azerbejd|azerbaij|premyer\s*liq/.test(n)) return "Azerbaijan Premier League";
  if (/\bcymru\b|\bwalia\b|\bwales\b/.test(n)) return "Cymru Premier";
  if (/bu[lł]garia|\bbulgaria\b|\bparva\b|\befbet/.test(n)) return "Parva Liga";
  if (/chorwacj|croatia|hnl/.test(n)) return "HNL";
  if (/uganda/.test(n)) return "Uganda Premier League";
  if (/izrael|\bisrael\b|ligat\s*ha/.test(n)) return "Ligat Ha'Al";
  if (/bialorus|\bbelarus\b|vysshaya|vysheyshaya/.test(n)) return "Belarus Premier League";
  if (/bosn|hercegowin|herzegovin|premijer/.test(n)) return "Premijer Liga";
  if (/[lł]otwa|\blatvia\b|\bvirsliga\b/.test(n)) return "Virsliga";
  if (/\bbrazyl|\bbrazil|\bbrasileir/.test(n)) return "Brasileirão Série A";
  if (/saudyjsk|\barabia saud|\bsaudi\b/.test(n)) {
    if (/division|first/.test(n)) return "Saudi First Division";
    return "Saudi Pro League";
  }
  if (/(argentyn|argentina)/.test(n) && /nacional/.test(n)) return "Primera Nacional";
  if (/(argentyn|argentina)/.test(n)) return "Liga Profesional Argentina";
  if (/(norweg|norway)/.test(n) && /1\.?\s*division/.test(n)) return "1. Division Norway";
  if (/\bobos[- ]?liga/.test(n)) return "1. Division Norway";
  if (/\bszkoc|\bscotland\b/.test(n) && /championship/.test(n)) return "Scottish Championship";
  if (/\bszkoc|\bscotland\b/.test(n)) return "Scottish Premiership";
  if (/\bpremiership\b/.test(n) && !/north|irland|ireland|\bnifl\b/.test(n)) return "Scottish Premiership";
  if (/(turcj|turkey|turkiye|türkiye)/.test(n) && /1\.?\s*lig/.test(n) && !/super|süper/.test(n)) return "TFF 1. Lig";
  if (/\btff\s*1/.test(n)) return "TFF 1. Lig";
  const hit = LEAGUES.find((l) => {
    const ln = fold(l);
    if (n === ln) return true;
    if (ln === "super lig" && /super\s*liga/.test(n) && !/turc|turkey/.test(n)) return false;
    if (ln === "swiss super league" && !/swiss|szwajc|switzerland/.test(n)) return false;
    if (ln === "singapore premier league" && !/singapur|singapore/.test(n)) return false;
    if (ln === "thai league 1" && !/thai|tajland/.test(n)) return false;
    if (ln === "v-league" && !/wietnam|vietnam|v[- ]?league/.test(n)) return false;
    if (ln === "super league greece" && !/grec|greece/.test(n)) return false;
    if (ln === "chile primera division" && !/chile/.test(n)) return false;
    if (ln.length >= 6 && n.includes(ln)) return true;
    // Krótkie tokeny typu „SuperLiga” nie mogą kraść Superliga Denmark.
    if (n.length >= 12 && ln.includes(n)) return true;
    return false;
  });
  if (hit) return hit;
  const aliases: [string, string][] = [
    ["poland", "Ekstraklasa"],
    ["polska", "Ekstraklasa"],
    ["epl", "Premier League"],
    ["england", "Premier League"],
    ["laliga", "LaLiga"],
    ["la liga", "LaLiga"],
    ["spain", "LaLiga"],
    ["italy", "Serie A"],
    ["serie a", "Serie A"],
    ["bundesliga", "Bundesliga"],
    ["germany", "Bundesliga"],
    ["austria", "Austrian Bundesliga"],
    ["chile", "Chile Primera División"],
    ["colombia", "Colombia Primera A"],
    ["columbia", "Colombia Primera A"],
    ["kolumbia", "Colombia Primera A"],
    ["denmark", "Superliga Denmark"],
    ["dania", "Superliga Denmark"],
    ["france", "Ligue 1"],
    ["eredivisie", "Eredivisie"],
    ["netherlands", "Eredivisie"],
    ["holandia", "Eredivisie"],
    ["portugal", "Liga Portugal"],
    ["liga portugal", "Liga Portugal"],
    ["turkey", "Süper Lig"],
    ["turcja", "Süper Lig"],
    ["tff 1", "TFF 1. Lig"],
    ["scotland", "Scottish Premiership"],
    ["szkocja", "Scottish Premiership"],
    ["nifl", "NIFL Premiership"],
    ["northern ireland", "NIFL Premiership"],
    ["premiership", "Scottish Premiership"],
    ["sweden", "Allsvenskan"],
    ["norway", "Eliteserien"],
    ["finland", "Veikkausliiga"],
    ["brazil", "Brasileirão Série A"],
    ["brasileirao", "Brasileirão Série A"],
    ["mls", "MLS"],
    ["botola", "Botola Pro"],
    ["egypt", "Egyptian Premier League"],
    ["egipt", "Egyptian Premier League"],
    ["egyptian", "Egyptian Premier League"],
    ["tunisia", "Tunisian Ligue 1"],
    ["iceland", "Besta deild"],
    ["ireland", "League of Ireland"],
    ["romania", "Liga I Romania"],
    ["rumunia", "Liga I Romania"],
    ["estonia", "Meistriliiga"],
    ["calcutta", "Calcutta Premier Division"],
    ["kolkata", "Calcutta Premier Division"],
    ["mizoram", "Mizoram Premier League"],
    ["kazakhstan", "Kazakhstan Premier League"],
    ["kazachstan", "Kazakhstan Premier League"],
    ["first league kazakh", "Kazakhstan First League"],
    ["azerbaijan", "Azerbaijan Premier League"],
    ["azerbejdzan", "Azerbaijan Premier League"],
    ["premyer liq", "Azerbaijan Premier League"],
    ["cymru", "Cymru Premier"],
    ["walia", "Cymru Premier"],
    ["wales", "Cymru Premier"],
    ["bulgaria", "Parva Liga"],
    ["bulgaria", "Parva Liga"],
    ["parva", "Parva Liga"],
    ["efbet", "Parva Liga"],
    ["croatia", "HNL"],
    ["chorwacja", "HNL"],
    ["hnl", "HNL"],
    ["uganda", "Uganda Premier League"],
    ["izrael", "Ligat Ha'Al"],
    ["israel", "Ligat Ha'Al"],
    ["ligat ha", "Ligat Ha'Al"],
    ["bosnia", "Premijer Liga"],
    ["bosnia", "Premijer Liga"],
    ["hercegowina", "Premijer Liga"],
    ["premijer", "Premijer Liga"],
    ["latvia", "Virsliga"],
    ["lotwa", "Virsliga"],
    ["virsliga", "Virsliga"],
    ["saudi", "Saudi Pro League"],
    ["saudyjska", "Saudi Pro League"],
    ["primera nacional", "Primera Nacional"],
    ["liga profesional", "Liga Profesional Argentina"],
    ["argentyna", "Liga Profesional Argentina"],
    ["argentina", "Liga Profesional Argentina"],
    ["uzbekistan", "Uzbekistan Super League"],
    ["urugwaj", "Uruguay Primera División"],
    ["uruguay", "Uruguay Primera División"],
    ["serbia", "Serbia Super Liga"],
    ["fnl", "Czech FNL"],
    ["challenge league", "Swiss Challenge League"],
    ["ykkonen", "Ykkönen"],
    ["ykkosliiga", "Ykkönen"],
    ["veikkausliiga", "Veikkausliiga"],
    ["wietnam", "V-League"],
    ["vietnam", "V-League"],
    ["v-league", "V-League"],
    ["v league", "V-League"],
    ["tajland", "Thai League 1"],
    ["thailand", "Thai League 1"],
    ["thai league", "Thai League 1"],
    ["singapur", "Singapore Premier League"],
    ["singapore", "Singapore Premier League"],
    ["i liga", "I Liga"],
    ["fortuna 1 liga", "I Liga"],
  ];
  const alias = aliases.find(([k]) => n.includes(k));
  return alias ? alias[1] : raw.trim();
}

export const LEAGUES = [
  "Ekstraklasa",
  "I Liga",
  "Premier League",
  "LaLiga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
  "Eredivisie",
  "Liga Portugal",
  "Süper Lig",
  "TFF 1. Lig",
  "Scottish Premiership",
  "NIFL Premiership",
  "Super League Greece",
  "Allsvenskan",
  "Superettan",
  "Eliteserien",
  "Veikkausliiga",
  "Ykkönen",
  "Superliga Denmark",
  "1. Division Denmark",
  "Czech First League",
  "Czech FNL",
  "Austrian Bundesliga",
  "Swiss Super League",
  "Swiss Challenge League",
  "Belgian Pro League",
  "Championship",
  "Scottish Championship",
  "2. Bundesliga",
  "Serie B",
  "Ligue 2",
  "Segunda División",
  "Chile Primera División",
  "Chile Primera B",
  "Colombia Primera A",
  "Colombia Primera B",
  "Brasileirão Série A",
  "Liga MX",
  "MLS",
  "J1 League",
  "K League 1",
  "Saudi Pro League",
  "Botola Pro",
  "Egyptian Premier League",
  "V-League",
  "Thai League 1",
  "Singapore Premier League",
  "Tunisian Ligue 1",
  "Uzbekistan Super League",
  "Uruguay Primera División",
  "Serbia Super Liga",
  "Besta deild",
  "League of Ireland",
  "Liga I Romania",
  "Meistriliiga",
  "Calcutta Premier Division",
  "Mizoram Premier League",
  "Kazakhstan Premier League",
  "Kazakhstan First League",
  "Azerbaijan Premier League",
  "Cymru Premier",
  "Parva Liga",
  "HNL",
  "Premijer Liga",
  "Uganda Premier League",
  "Ligat Ha'Al",
  "Belarus Premier League",
  "Saudi First Division",
  "Virsliga",
  "Liga Profesional Argentina",
  "Primera Nacional",
  "1. Division Norway",
  "Inna liga",
];
