const BOT_TOKEN = "saved_msg me stored h";
const CHAT_ID = "notes me h..";

const MAX_ALERTS_PER_RUN = 5;

const SEARCH_TERMS = [
  "data analyst",
  "python developer",
  "data scientist",
  "data engineer",
  "business analyst",
  "sql analyst",
  "machine learning",
  "analytics intern"
];

const INCLUDE = [
  "data analyst", "data analytics", "analytics analyst",
  "business analyst", "business intelligence", "bi analyst",
  "mis analyst", "reporting analyst", "data reporting",
  "data visualization", "data operations", "data quality",
  "sql analyst", "python developer", "python engineer",
  "python", "data scientist", "data science",
  "machine learning", "ml engineer", "ai engineer",
  "data engineer", "analytics engineer", "research analyst",
  "research intern", "data internship", "data intern",
  "python intern", "analytics intern", "machine learning intern",
  "ai intern", "sql", "junior analyst"
];

const EXCLUDE = [
  "senior", "sr.", "lead", "manager", "director",
  "principal", "head of", "staff", "architect",
  "experienced", "team lead"
];

// TEST TELEGRAM
function sendTestMessage() {
  sendTelegram("Job Scout connected. India fresher job alerts are active.");
}

// MAIN SEARCH
function checkJobs() {
  const jobs = [];

  // YUBHUB INDIA SEARCH API
  SEARCH_TERMS.forEach(query => {
    try {
      const url =
        "https://api.yubhub.co/search?q=" +
        encodeURIComponent(query) +
        "&country=IN&page=1&perPage=50";

      const result = fetchJSON(url);

      const list = getJobList(result);

      list.forEach(j => {
        jobs.push(normalizeJob(j, "YubHub India"));
      });

    } catch (e) {
      console.log("Search error (" + query + "): " + e);
    }
  });

  // INDIA JOB FEED
  try {
    const result = fetchJSON(
      "https://feeds.yubhub.co/facet/city/india.json"
    );

    getJobList(result).forEach(j => {
      jobs.push(normalizeJob(j, "India Job Feed"));
    });

  } catch (e) {
    console.log("India feed error: " + e);
  }

  // DEDUPLICATE CURRENT RESULTS
  const uniqueJobs = [];
  const currentIds = new Set();

  jobs.forEach(j => {
    if (!j.id || !j.url) return;
    if (currentIds.has(j.id)) return;

    currentIds.add(j.id);
    uniqueJobs.push(j);
  });

  // EXISTING HISTORY
  const props = PropertiesService.getScriptProperties();
  const seen = JSON.parse(props.getProperty("SEEN_JOBS") || "[]");
  const seenSet = new Set(seen);

  // FILTER
  const matches = uniqueJobs.filter(j =>
    !seenSet.has(j.id) &&
    isIndiaFresherJob(j)
  );

  matches.sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );

  const selected = matches.slice(0, MAX_ALERTS_PER_RUN);

  // SEND TELEGRAM
  selected.forEach(j => {
    const message =
      "NEW INDIA FRESHER JOB\n\n" +
      "Role: " + clean(j.title) + "\n" +
      "Company: " + clean(j.company || "Not listed") + "\n" +
      "Location: " + clean(j.location) + "\n" +
      "Experience: " + clean(j.experience || "Entry level") + "\n" +
      "Source: " + j.source + "\n\n" +
      j.url;

    sendTelegram(message);
    seenSet.add(j.id);
  });

  props.setProperty(
    "SEEN_JOBS",
    JSON.stringify(Array.from(seenSet).slice(-3000))
  );

  console.log("Fetched jobs: " + uniqueJobs.length);
  console.log("India fresher matches: " + matches.length);
  console.log("Alerts sent: " + selected.length);
}

// EXTRACT JOB LIST FROM DIFFERENT RESPONSE SHAPES
function getJobList(result) {
  if (Array.isArray(result)) return result;

  if (result && Array.isArray(result.jobs)) return result.jobs;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.results)) return result.results;

  if (result && result.data && Array.isArray(result.data.jobs)) {
    return result.data.jobs;
  }

  return [];
}

// NORMALIZE JOB DATA
function normalizeJob(j, source) {
  const org = j.hiringOrganization || j.company || {};
  const locObj = j.jobLocation || j.location || {};
  const address = locObj.address || locObj || {};

  const locationParts = [
    address.addressLocality,
    address.addressRegion,
    address.addressCountry,
    j.city,
    j.country
  ].filter(Boolean);

  const location = typeof j.location === "string"
    ? j.location
    : locationParts.join(", ");

  const exp =
    j.experienceLevel ||
    j.experience ||
    j.seniority ||
    j.level ||
    j.qualifications ||
    "";

  const description = [
    j.description,
    j.jobDescription,
    j.jobExcerpt,
    j.skills,
    j.requirements,
    j.qualifications,
    exp
  ].flat().join(" ");

  const url =
    j.url ||
    j.applyUrl ||
    j.applicationUrl ||
    j.apply_url ||
    "";

  const id =
    j.identifier ||
    j.id ||
    j.slug ||
    url;

  return {
    id: "india_" + id,
    title: j.title || j.jobTitle || "",
    company: typeof org === "string"
      ? org
      : org.name || j.companyName || "",
    location: location || "",
    url: url,
    description: description,
    experience: String(exp),
    source: source,
    date: j.datePosted || j.pubDate || j.created_at || j.postedAt || ""
  };
}

// INDIA + FRESHER FILTER
function isIndiaFresherJob(j) {
  const title = (j.title || "").toLowerCase();
  const description = (j.description || "").toLowerCase();
  const location = (j.location || "").toLowerCase();
  const experience = (j.experience || "").toLowerCase();

  const text = title + " " + description + " " + experience;

  // INDIA ONLY
  if (!isIndiaLocation(location)) return false;

  // TARGET JOBS ONLY
  if (!INCLUDE.some(word => text.includes(word))) return false;

  // REJECT SENIOR JOB TITLES
  if (EXCLUDE.some(word => title.includes(word))) return false;

  // REJECT EXPLICIT 3+ YEARS
  if (
    /\b([3-9]|1[0-9])\+?\s*(years?|yrs?)\s*(of\s*)?experience\b/i.test(text) ||
    /\bminimum\s+(of\s+)?[3-9]\s+years?\b/i.test(text) ||
    /\b3\s*-\s*[9]\s*(years?|yrs?)\b/i.test(text)
  ) {
    return false;
  }

  // FRESHER / ENTRY-LEVEL SIGNAL
  const fresherSignals = [
    "fresher", "freshers", "entry level", "entry-level",
    "junior", "graduate", "new grad", "campus hiring",
    "campus placement", "intern", "internship", "trainee",
    "early career", "no experience", "without experience",
    "0-1 year", "0 to 1 year", "0-2 years", "0 to 2 years",
    "1 year experience", "2 years experience"
  ];

  const hasFresherSignal = fresherSignals.some(word =>
    text.includes(word)
  );

  const hasLowExperience =
    /\b(0|1|2)\s*(\+|to|-)?\s*(years?|yrs?)\s*(of\s*)?(experience)?\b/i.test(text) ||
    /\b(0|1|2)\s*(years?|yrs?)\s*(of\s*)?experience\b/i.test(text);

  // MUST BE ENTRY LEVEL
  if (!hasFresherSignal && !hasLowExperience) return false;

  return true;
}

// INDIA LOCATION CHECK
function isIndiaLocation(location) {
  const indiaLocations = [
    "india", "indian",
    "bengaluru", "bangalore", "hyderabad", "chennai",
    "mumbai", "pune", "delhi", "noida", "gurgaon",
    "gurugram", "kolkata", "jaipur", "ahmedabad",
    "kochi", "lucknow", "patna", "bhopal", "indore",
    "chandigarh", "nagpur", "coimbatore", "visakhapatnam",
    "surat", "vadodara", "thane", "rajkot", "faridabad",
    "ghaziabad", "mysore", "trivandrum", "bhubaneswar",
    "dehradun", "ranchi", "guwahati", "amritsar"
  ];

  const loc = (location || "").toLowerCase();

  return indiaLocations.some(city => loc.includes(city));
}

// FETCH JSON
function fetchJSON(url) {
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      Accept: "application/json"
    }
  });

  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error("HTTP " + code);
  }

  return JSON.parse(response.getContentText());
}

// TELEGRAM
function sendTelegram(text) {
  const url =
    "https://api.telegram.org/bot" +
    BOT_TOKEN +
    "/sendMessage";

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: CHAT_ID,
      text: text,
      disable_web_page_preview: false
    }),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("Telegram error: " + response.getContentText());
  }
}

// CLEAN TEXT
function clean(text) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// HOURLY TRIGGER
function installHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "checkJobs") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("checkJobs")
    .timeBased()
    .everyHours(1)
    .create();

  console.log("Hourly trigger installed.");
}
