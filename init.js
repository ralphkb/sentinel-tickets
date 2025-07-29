const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { QuickDB } = require("quick.db");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});


let dbPath = "";
if (config.dbPath?.includes("{root}")) {
  dbPath = config.dbPath.replace("{root}", __dirname);
} else {
  dbPath = config.dbPath;
}

const dataDir = path.resolve(dbPath);
console.log(`Using data directory: ${dataDir}`);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mainDB = new QuickDB({ filePath: path.join(dataDir, "data/main.sqlite") });
const ticketsDB = new QuickDB({ filePath: path.join(dataDir, "data/tickets.sqlite") });
const blacklistDB = new QuickDB({ filePath: path.join(dataDir, "data/blacklist.sqlite") });

(async function () {
  // Initialize totalTickets to 1 if it doesn't exist
  if (!(await mainDB.has("totalTickets"))) {
    await mainDB.set("totalTickets", 1);
  }

  // Initialize openTickets to an empty array if it doesn't exist
  if (!(await mainDB.has("openTickets"))) {
    await mainDB.set("openTickets", 0);
  }

  // Initialize totalClaims to 0 if it doesn't exist
  if (!(await mainDB.has("totalClaims"))) {
    await mainDB.set("totalClaims", 0);
  }

  // Initialize totalReviews to 0 if it doesn't exist
  if (!(await mainDB.has("totalReviews"))) {
    await mainDB.set("totalReviews", 0);
  }

  // Initialize ratings to an empty array if it doesn't exist
  if (!(await mainDB.has("ratings"))) {
    await mainDB.set("ratings", []);
  }

  // Initialize totalMessages to 0 if it doesn't exist
  if (!(await mainDB.has("totalMessages"))) {
    await mainDB.set("totalMessages", 0);
  }

  // Initialize ticketCreators to an empty array if it doesn't exist
  if (!(await mainDB.has("ticketCreators"))) {
    await mainDB.set("ticketCreators", []);
  }
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
