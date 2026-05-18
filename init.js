const { Client, GatewayIntentBits } = require("discord.js");
const path = require("path");
const yaml = require("yaml");
const { QuickDB } = require("quick.db");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const configFile = fs.readFileSync("./config.yml", "utf8");
let localeFile = "";
try {
  localeFile = fs.readFileSync("./locale.yml", "utf8");
} catch {
  console.log("No locale.yml found, proceeding with config.yml only.");
}

function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}

function deepMerge(target, source) {
  if (Array.isArray(target) && Array.isArray(source)) {
    if (
      target.length > 0 &&
      isObject(target[0]) &&
      target[0].id !== undefined
    ) {
      const result = [...target];
      for (const sourceItem of source) {
        if (!isObject(sourceItem) || sourceItem.id === undefined) {
          result.push(sourceItem);
          continue;
        }
        const targetIndex = result.findIndex((t) => t.id === sourceItem.id);
        if (targetIndex !== -1) {
          result[targetIndex] = deepMerge(result[targetIndex], sourceItem);
        } else {
          result.push(sourceItem);
        }
      }
      return result;
    }
    return source;
  }

  if (isObject(target) && isObject(source)) {
    const result = { ...target };
    for (const key in source) {
      if (isObject(source[key]) || Array.isArray(source[key])) {
        if (key in target) {
          result[key] = deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  return source;
}

const configData = yaml.parse(configFile) || {};
const localeData = (localeFile ? yaml.parse(localeFile) : {}) || {};

globalThis.config = deepMerge(configData, localeData);

if (config.dbPath === undefined) {
  config.dbPath = path.join(__dirname, "data");
} else if (config.dbPath?.includes("{root}")) {
  config.dbPath = config.dbPath.replace("{root}", __dirname);
}

const dataDir = path.resolve(config.dbPath);
if (!config.silentStartup) {
  console.log(`Using data directory: ${dataDir}`);
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mainDB = new QuickDB({ filePath: path.join(dataDir, "main.sqlite") });
const ticketsDB = new QuickDB({
  filePath: path.join(dataDir, "tickets.sqlite"),
});
const blacklistDB = new QuickDB({
  filePath: path.join(dataDir, "blacklist.sqlite"),
});

(async function () {
  const defaultKeys = [
    { key: "totalTickets", value: 1 },
    { key: "openTickets", value: 0 },
    { key: "totalClaims", value: 0 },
    { key: "totalReviews", value: 0 },
    { key: "ratings", value: [] },
    { key: "totalMessages", value: 0 },
    { key: "ticketCreators", value: [] },
  ];

  await Promise.all(
    defaultKeys.map(async ({ key, value }) => {
      if (!(await mainDB.has(key))) {
        await mainDB.set(key, value);
      }
    }),
  );
})();

// Extract information from the config.yml to properly setup the ticket categories
const ticketCategories = [];

config.TicketCategories.forEach((category) => {
  const {
    id,
    name,
    nameEmoji,
    categoryID,
    closedCategoryID,
    support_role_ids,
    permissions,
    pingRoles,
    ping_role_ids,
    ghostPingRoles,
    textContent,
    creatorRoles,
    buttonEmoji,
    buttonLabel,
    buttonStyle,
    menuEmoji,
    menuLabel,
    menuDescription,
    embedTitle,
    color,
    description,
    ticketName,
    ticketTopic,
    slowmode,
    useCodeBlocks,
    modal,
    modalTitle,
    questions,
  } = category;

  const extractedQuestions = questions.map((question) => {
    const { label, placeholder, style, required, minLength, maxLength } =
      question;

    return {
      label,
      placeholder,
      style,
      required,
      minLength,
      maxLength,
    };
  });

  ticketCategories[id] = {
    name,
    nameEmoji,
    categoryID,
    closedCategoryID,
    support_role_ids,
    permissions,
    pingRoles,
    ping_role_ids,
    ghostPingRoles,
    textContent,
    creatorRoles,
    buttonEmoji,
    buttonLabel,
    buttonStyle,
    menuEmoji,
    menuLabel,
    menuDescription,
    embedTitle,
    color,
    description,
    ticketName,
    ticketTopic,
    slowmode,
    useCodeBlocks,
    modal,
    modalTitle,
    questions: extractedQuestions,
  };
});

module.exports = {
  client,
  ticketCategories,
  mainDB,
  ticketsDB,
  blacklistDB,
};
