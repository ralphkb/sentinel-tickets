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

// Check if the data directory exists, and if not, create it
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mainDB = new QuickDB({ filePath: "data/main.sqlite" });
const ticketsDB = new QuickDB({ filePath: "data/tickets.sqlite" });
const blacklistDB = new QuickDB({ filePath: "data/blacklist.sqlite" });

(async function () {
  // Initialize totalTickets to 1 if it doesn't exist
  if (!(await mainDB.has("totalTickets"))) {
    await mainDB.set("totalTickets", 1);
  }

  // Initialize openTickets to an empty array if it doesn't exist
  if (!(await mainDB.has("openTickets"))) {
    await mainDB.set("openTickets", []);
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
    modalTitle,
    questions,
  } = category;

  const extractedQuestions = questions.map((question) => {
    const { label, placeholder, style, required, minLength } = question;

    return {
      label,
      placeholder,
      style,
      required,
      minLength,
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
