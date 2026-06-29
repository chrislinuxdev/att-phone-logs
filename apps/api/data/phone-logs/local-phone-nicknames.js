(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.phoneLogLocalNicknames = api.phoneLogLocalNicknames;
    root.normalizePhoneNumber = api.normalizePhoneNumber;
    root.getLocalNickname = api.getLocalNickname;
    root.registerLocalNickname = api.registerLocalNickname;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const phoneLogLocalNicknames = {
    "22395": "Shopify 2FA Gen",
    "24273": "Chase Bank",
    "35213": "Amazon",
    "41646": "WalMart",
    "72975": "Paypal",
    "2173624397": "IDHS",
    "2243053218": "Jeff Raju",
    "2244327204": "Jesus Esquivias",
    "2245381656": "Finley",
    "2245724949": "Feby",
    "2246106656": "Dre",
    "2817363248": "Keziah / Susan / Kevin Alex",
    "3122178544": "NP",
    "3122874294": "Riya's Dad",
    "3128154910": "Northwestern Medicine",
    "3128235584": "Josh Raju",
    "3128235586": "Riya's Mom",
    "3612171594": "Texas 1",
    "4055145640": "Angie Raju",
    "4075653025": "nnn",
    "4145335327": "Brandon",
    "4698264671": "Marily",
    "6302610400": "Flood Brothers",
    "6303306571": "Chris Sr",
    "6306514317": "Ruth Ann",
    "7083168251": "?",
    "8002903935": "Chase",
    "8153377700": "The Law Offices of Lee & Wombacher",
    "8153459934": "Tanner Fehring",
    "8153851530": "Plum Garden",
    "8153856840": "Samual J Diamond Lawyer",    
    "8154594455": "Sage YMCA",
    "8154596727": "Montessori Pathways",
    "8154772273": "Dartmoor Dental",
    "8156558685": "Wingstop",
    "8472041758": "Ann Rajan",
    "8477673299": "Kim Evans",
    "8474496917": "Maggio And Tartaglia",
    "8474565576": "Stacy",
    "8474586000": "Holiday Inn Express",
    "8474588765": "Gatehouse",
    "8474851884": "Hair Cuttery",
    "8475567026": "Abhijit Banerjee",
    "8476040279": "Advanced Air Svcs",
    "8476091445": "Ben Chakko",
    "8476301959": "Ashley Evans",
    "8479024059": "Chris",
    "8479973127": "Mike Shrader",
    "8553786467": "Costco Citi",
    "8556833055": "Ascension Bill Pay",
    "8779813661": "ATT Ofc Pres",
    "6306504317": "Mike Willow Creek",
    "8153820231": "Alex Larson",
    "8154038214": "Danielle Larson",
    "2248298543": "Ben Hawrysko",
    "8475300101": "Taylor Hawrysko",
    "8476271217": "Eric Barge",
    "8476271218": "Karlie Barge",
    "8153459935": "Tanner Fehring",
    "8153535445": "Taylor Fehring",
    "6302224244": "Nancy Evans",
    "6785922351": "Shawn Shrader",
    "6303889864": "Sue Dawn",
    "8473373128": "Susan Shrader",
    "8323865358": "Ayman",
    "6105549614": "Ben Thomas",
    "8473872028": "Jeff Evans",
    "8152125021": "Casey Willow Creek",
    "9702905759": "Adam Willow Creek",
    "7144230023": "Chris Willow Creek",
    "9095698703": "Crystal Willow Creek",
    "8473125920": "Chris Sr. Old Phone",
    "8473469055": "David Arosen",
    "2246785454": "Emily D",
    "2245429671": "Febin",
    "7143933514": "Isaac Willow Creek",
    "7084469814": "Jeff Willow Creek",
    "8477081306": "Kat Koralik",
    "9702172914": "Kirstin Small Group",
    "8479620521": "Komal Old Neighbor",
    "2246169059": "Korah",
    "8472098328": "Kristin Arosen",
    "8155271971": "Kristin Miller",
    "2533282107": "Linnea Small Group",
    "7798005881": "Loan",
    "9564639016": "Mira",
    "2817052606": "Mishuk",
    "8153537400": "Nikki Small Group",
    "8328605465": "Pavan",
    "8153439958": "Rachel Willow Creek",
    "7142876827": "Rose Willow Creek",
    "6513151309": "Ryan Small Group",
    "8477213923": "Steve Woloszyk",
    "8475132797": "Tasneem Qudrat",
    "8478452789": "Tina Shrader",
    "8479212356": "Dan Evans",
    "6302903628": "Scott Shrader",
    "7706052698": "Steve Shrader",
    "9493376262": "Tommy Evans",
    "8153454980": "McHenry County Jail",
    "2246377232": "Bombay Boutique",
    "8476585676": "Lake in the Hills Police Dept.",
    "8153344310": "McHenry County Circut Clerk",
    "8153382144": "McHenry County Sheriff",
    "8153388081": "Turning Point Domestic Violence",
    "8153389396": "Law Office of Loizzo & Loizzo",
    "8153344000": "McHenry County Government Center",
    "8153344190": "McHenry County Circut Clerk",
    "8478447585": "Pampered Pets",
    "8153344624": "McHenry County Circut Clerk",
    "8778636338": "National Domestic Violence Hotline",
    "8154777000": "Holiday Inn Crystal Lake",
    "2818354377": "Shaji",
    "8154556000": "Northwestern Primary Care Crystal Lake",
    "8883402265": "BMO Harris Bank",
    "8159004554": "Center for Therapeutic Services & Psychodiagnostics",
    "8475157181": "Kosta's Gyros",
    "8474582774": "Discount Tire",
    "8666965673": "Citi Simplicity",
    "8009452000": "Chase Card Services",
    "8882583741": "American Express",
    "8332727585": "Ascension Bill Pay",
    "8476581783": "Ziegler's Ace-Lake in the Hills",
    "2244847720": "Kid's Empire Algonquin",
    "6307994449": "Hiro - BMO",
    "0000000911": "911 Emergency",
    "8154440004": "Krystal Thai",
    "8476696679": "Butcher On the Block",
    "8153565550": "Nick's Pizza & Pub",
    "7086655170": "Lanstrom Center - Neuropsychology",
    "6086589048": "Rachel Wezeman (LITH)",
    "8887297332": "Target Circle Card",
    "2242522908": "Condor's Peruvian Chicken",
    "8153568899": "Chen Chinese",
    "8472215622": "BZA Behavioral Health",
    "7792445791": "Restaurante Hondureno",
    "8479815900": "Foglia Treatment Center",
    "8158930231": "Goal Line Sports Bar",
    "8478821600": "Alexian Brothers Behavioral Health Hospital",
    "8154778300": "Kyoto Restaurant",
    "2246540780": "Huntly Hospital Ambulatory Treatment",
    "8158936119": "Pho Royal",
    "8477072689": "Wellspring Counseling",
    "8476789234": "Preflight Airport Parking",
    "8476681268": "True Spa Cary",
    "2243330217": "Mr. Kimchi Algonquin",
    "8478367946": "Dolphin Cove",
    "7792209288": "Crystal Lake Brewing",
    "8474582504": "Cucina Bella Restaurant",
    "7739055115": "YMCA Metropolitan",
    "8008290922": "IRS",
    "8478027480": "Northwestern Medicine Hungly Oncology?",
    "8008291040": "IRS",
    "28732": "CVS Pharmacy",
    "60717": "Northwestern Medicine",
    "898287": "CVS Pharmacy",
    "72166": "Chase Fraud Alerts",
    "36246": "Open Table Reservations",
    "61979": "Northwestern Medicine",
    "346637": "Resy Dining Reservations",
    "94917": "BMO Harris Bank",
    "46339": "FedEx",
    "29694": "Evite",
    "84706": "Empower Retirement",
    "25595": "Ally Bank",
    "57513": "Walmart",
    "75243": "Plaid - Venmo",
    "62438": "eBay",
    "729725": "Paypal",
    "32665": "Facebook",
    "41098": "Citi",
    "78412": "Sam's Club",
    "68953": "Veho Parcel Tracking",    
    "65396": "Slice",
    "70924": "Paypal",
    "56181": "Walgreens",
    "62863": "Facebook",
    "248487": "Citi",
    "56695": "BMO Harris Bank",
    "72739": "7 Brew Coffee",
    "85818": "EZ Pass (SCAM)",
    "57269": "Advocate Health Care",
    "90403": "Punchbowl",
    "41368": "Aetna",
    "47458": "Yahoo",
    "51004": "SPAM",
    "30804": "Natural Life Women's Clothing",
    "68382": "Walmart",
    "56058": "Target",
    "56266": "Joann Fabrics",
    "35922": "American Airlines",
    "48267": "American Express",
    "26266": "United Airlines",
    "36726": "Fidelity Investments",
    "77598": "Ticketmaster",
    "98626": "Amazon",
    "33959": "SPAM",
    "74454": "Okta",
    "676547": "Rental Cars",
    "2014623963": "Wingstop",
    "5165928366": "Caleb Varghese",
    "6465238768": "Finny Varghese",
    "8476091488": "Justin Chacko",
    "8476091445": "Ben Chacko",
    "2245381656": "Finley George",
    "7733123336": "Center for Therapeutic Services",
    "8329554770": "Keziah Alex",
    "8332568308": "Yahoo Verification",
    "8473612243": "Sean Small Group",
    "8473728728": "Aubrey Small Group",
    "8552448147": "Credit Karma",
    "8883565443": "Wellspring Appointments",
    "9179918996": "Libby Thomas",
    "9253266368": "me&u Restaurant Payment App",   
    "2817934137": "Amy Hoff (LITH)",
    "4058228650": "Angie's Dad",
    "83826": "VETCO Clinics",
    "2819356471": "Shaji (2)",
    "2242493181": "SPAM (March Madness)",
    "2243848065": "Scott Shrader (OLD)",
    "2247248408": "SPAM (McHenry County Servey)",
    "2815034218": "SPAM (Friends for Peace)",
    "3124654628": "Northwestern Feedback",
    "3372180257": "SPAM (Senator Don DeWhite)",
    "6306564445": "Katelyn Shrader",
    "7732204654": "Rebecca Kopec",
    "8004441676": "Citibank",
    "6087406870": "Embassy Suites Madison WI",
    "2244339963": "Karyn Dorfman / Payton",
    "7083342016": "Lynelle James",
    "6303467479": "Marissa Denicolo",
    "3316433966": "Epiphany Vasquez",
    "8477915650" :"Jenni Darken / Perz",
    "2242100605": "Christine Totten / Pfeiffer",
    "2243881603": "Sarika Jain (LITH)",
    "2244897107": "Michelle Schumacher / Kloser",
    "2242410362": "Latasha McCann",
    "4178255910": "Sandra Allan",
    "8472089192": "Karen Goens (RE/MAX)",
    "8152194990": "Randall Village Apartments",
    "6305036676": "Barrington Lakes Apartments",
    "2248023101": "Reserve Randall Road Apartments",
    "97861": "2FA for RentCafe",
    "46395": "Albertsons Coupons",
    "60571": "MarcoPolo Text Campaign",
    "82289": "HomeMortgageAssesors Campaign",
    "43789": "Hertz Car Rental"
  };

  function normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || "").replace(/\D/g, "");

    if (digits.length === 11 && digits.startsWith("1")) {
      return digits.slice(1);
    }

    return digits;
  }

  function getLocalNickname(phoneNumber) {
    return phoneLogLocalNicknames[normalizePhoneNumber(phoneNumber)] || "";
  }

  function registerLocalNickname(phoneNumber, nickname) {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const cleanedNickname = String(nickname || "").trim();

    if (!normalizedPhoneNumber || !cleanedNickname || phoneLogLocalNicknames[normalizedPhoneNumber]) {
      return false;
    }

    phoneLogLocalNicknames[normalizedPhoneNumber] = cleanedNickname;
    return true;
  }

  function serializePhoneLogLocalNicknamesModule() {
    return `(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.phoneLogLocalNicknames = api.phoneLogLocalNicknames;
    root.normalizePhoneNumber = api.normalizePhoneNumber;
    root.getLocalNickname = api.getLocalNickname;
    root.registerLocalNickname = api.registerLocalNickname;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const phoneLogLocalNicknames = ${JSON.stringify(phoneLogLocalNicknames, null, 2)};

  function normalizePhoneNumber(phoneNumber) {
    const digits = String(phoneNumber || "").replace(/\\D/g, "");

    if (digits.length === 11 && digits.startsWith("1")) {
      return digits.slice(1);
    }

    return digits;
  }

  function getLocalNickname(phoneNumber) {
    return phoneLogLocalNicknames[normalizePhoneNumber(phoneNumber)] || "";
  }

  function registerLocalNickname(phoneNumber, nickname) {
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const cleanedNickname = String(nickname || "").trim();

    if (!normalizedPhoneNumber || !cleanedNickname || phoneLogLocalNicknames[normalizedPhoneNumber]) {
      return false;
    }

    phoneLogLocalNicknames[normalizedPhoneNumber] = cleanedNickname;
    return true;
  }

  return {
    getLocalNickname,
    normalizePhoneNumber,
    phoneLogLocalNicknames,
    registerLocalNickname,
  };
});`;
  }

  return {
    getLocalNickname,
    normalizePhoneNumber,
    phoneLogLocalNicknames,
    registerLocalNickname,
    serializePhoneLogLocalNicknamesModule,
  };
});
