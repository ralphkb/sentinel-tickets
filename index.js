const { Collection } = require("discord.js");
require("dotenv").config({ quiet: true });
const path = require("path");
const { client, ticketsDB } = require("./init.js");
const {
  cleanBlacklist,
  logError,
  lastChannelMsgTimestamp,
  updateStatsChannels,
} = require("./utils/mainUtils.js");
const { autoCloseTicket } = require("./utils/ticketAutoClose.js");
const { autoDeleteTicket } = require("./utils/ticketAutoDelete.js");
const fs = require("fs");
client.startingTime = Date.now();

const blacklistInterval = config.blacklistCleanup || 120;
// Schedule the blacklist cleanup check every blacklistInterval seconds
setInterval(cleanBlacklist, blacklistInterval * 1000);

async function autoCloseTickets() {
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const tickets = (await ticketsDB.all()) || [];
  const openTickets = tickets.filter(
    (ticket) => ticket.value.status === "Open",
  );
  const autoCloseTime = config?.autoCloseTickets?.time || 86400; // Time in seconds

  if (openTickets.length > 0) {
    for (const ticket of openTickets) {
      const channelID = ticket.id;
      const lastMsgTime = await lastChannelMsgTimestamp(channelID);
      if (lastMsgTime === null) {
        continue;
      }

      const lastMsgTimeSeconds = Math.floor(lastMsgTime / 1000);
      const timeDifference = currentTime - lastMsgTimeSeconds;

      if (timeDifference > autoCloseTime) {
        await autoCloseTicket(channelID);
      }
    }
  }
}

async function autoDeleteTickets() {
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const tickets = (await ticketsDB.all()) || [];
  const closedTickets = tickets.filter(
    (ticket) => ticket.value.status === "Closed",
  );
  const autoDeleteTime = config?.autoDeleteTickets?.time || 86400; // Time in seconds

  if (closedTickets.length > 0) {
    for (const ticket of closedTickets) {
      const channelID = ticket.id;
      const { closedAt } = ticket.value;

      if (closedAt === 0 || closedAt === undefined) {
        continue;
      }

      const closedAtSeconds = Math.floor(closedAt / 1000);
      const timeDifference = currentTime - closedAtSeconds;

      if (timeDifference > autoDeleteTime) {
        await autoDeleteTicket(channelID);
      }
    }
  }
}

if (config.autoCloseTickets.enabled) {
  const autoCloseInterval = config?.autoCloseTickets?.interval || 60;
  setInterval(autoCloseTickets, autoCloseInterval * 1000);
}

if (config.autoDeleteTickets.enabled) {
  const autoDeleteInterval = config?.autoDeleteTickets?.interval || 60;
  setInterval(autoDeleteTickets, autoDeleteInterval * 1000);
}

if (config.statsChannels.enabled) {
  const statsInterval = parseInt(config?.statsChannels?.interval, 10) || 600;
  const statsIntervalMs = Math.max(statsInterval * 1000, 600 * 1000);
  setInterval(updateStatsChannels, statsIntervalMs);
}

// Holding commands cooldown data
client.cooldowns = new Collection();

// Reading command files
client.commands = new Collection();
const commandFolders = fs.readdirSync("./commands");
for (const folder of commandFolders) {
  const commandFiles = fs
    .readdirSync(`./commands/${folder}`)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const command = require(`./commands/${folder}/${file}`);
    if (command.enabled) {
      if (!config.silentStartup) {
        console.log(`The slash command [${file}] has been loaded!`);
      }
      client.commands.set(command.data.name, command);
    }
  }
}

// Reading event files
const eventsPath = path.join(__dirname, "events");
const eventFiles = fs
  .readdirSync(eventsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Error handlers
client.on("warn", async (error) => {
  console.log(error);
  await logError("WARN", error);
});

client.on("error", async (error) => {
  console.log(error);
  await logError("ERROR", error);
});

process.on("unhandledRejection", async (error) => {
  console.log(error);
  await logError("unhandledRejection", error);
});

process.on("uncaughtException", async (error) => {
  console.log(error);
  await logError("uncaughtException", error);
});

// Log in to Discord with your app's token
client.login(process.env.BOT_TOKEN).catch(async (error) => {
  if (error.message.includes("An invalid token was provided")) {
    console.log(error);
    await logError("INVALID_TOKEN", error);
    process.exit();
  } else if (
    error.message.includes(
      "Privileged intent provided is not enabled or whitelisted.",
    )
  ) {
    console.log(error);
    await logError("DISALLOWED_INTENTS", error);
    process.exit();
  } else {
    console.log(error);
    await logError("ERROR", error);
    process.exit();
  }
});
