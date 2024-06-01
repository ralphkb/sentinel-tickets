// Import necessary modules
const {
  Client,
  GatewayIntentBits,
  Collection,
  AttachmentBuilder,
  ActivityType,
  EmbedBuilder,
} = require("discord.js");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const packageJson = require("./package.json");
const { QuickDB } = require("quick.db");
const discordHtmlTranscripts = require("discord-html-transcripts");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);

// Check if the data directory exists, and if not, create it
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mainDB = new QuickDB({ filePath: "data/main.sqlite" });
const ticketsDB = new QuickDB({ filePath: "data/tickets.sqlite" });
const blacklistDB = new QuickDB({ filePath: "data/blacklist.sqlite" });
const date = new Date();
const options = {
  timeZoneName: "short",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: true,
};
const timeString = date.toLocaleString("en-US", options);

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

async function checkSupportRole(interaction) {
  const foundId = await ticketsDB.get(`${interaction.channel.id}.button`);
  const allowedRoles = ticketCategories[foundId].support_role_ids;
  return interaction.member.roles.cache.some((role) =>
    allowedRoles.includes(role.id),
  );
}

async function addTicketCreator(userID) {
  let ticketCreators = (await mainDB.get("ticketCreators")) || [];
  let existingCreator = ticketCreators.find(
    (creator) => creator.userID === userID,
  );

  if (existingCreator) {
    existingCreator.ticketsCreated++;
  } else {
    ticketCreators.push({ userID: userID, ticketsCreated: 1 });
  }

  await mainDB.set("ticketCreators", ticketCreators);
}

async function getUser(id) {
  let user = client.users.cache.get(id);

  if (user) {
    return user;
  } else {
    try {
      user = await client.users.fetch(id);
      return user;
    } catch (error) {
      console.error(`Error fetching user with ID ${id}:`, error);
      return null;
    }
  }
}

async function getRole(id) {
  let role = client.guilds.cache.get(process.env.GUILD_ID).roles.cache.get(id);

  if (!role) {
    try {
      role = await client.guilds.cache
        .get(process.env.GUILD_ID)
        .roles.fetch(id);
      return role;
    } catch (error) {
      console.error(`Error fetching role with ID ${id}:`, error);
      return null;
    }
  }

  return role;
}

// Find the first available category ID
const findAvailableCategory = async (categoryIDs) => {
  if (!Array.isArray(categoryIDs)) {
    throw new Error(
      'categoryID and closedCategoryID of each configured ticket category must be an array, such as ["ID"]',
    );
  }
  for (const categoryID of categoryIDs) {
    const category = client.channels.cache.get(categoryID);
    const channelCount = category.children.cache.size;
    if (channelCount < 50) {
      return categoryID;
    }
  }
  return null; // No available category found
};

async function getPermissionOverwrites(
  permissions,
  type = "open",
  defaults = {},
) {
  const permissionOverwrites = {};
  const allowPermissions = permissions?.[type]?.allow || defaults?.allow || [];
  const denyPermissions = permissions?.[type]?.deny || defaults?.deny || [];
  await Promise.all(
    allowPermissions.map(async (permission) => {
      permissionOverwrites[permission] = true;
    }),
  );
  await Promise.all(
    denyPermissions.map(async (permission) => {
      permissionOverwrites[permission] = false;
    }),
  );
  return permissionOverwrites;
}

async function configEmbed(configPath, defaultValues = {}) {
  const embed = new EmbedBuilder();
  if (Array.isArray(configPath) && configPath[0] === "panelEmbed") {
    const panelIndex = configPath[1];
    configValue = config.panels[panelIndex].panelEmbed;
  } else {
    configValue = config[configPath];
  }

  embed.setDescription(
    configValue.description || defaultValues.description || null,
  );

  embed.setColor(configValue.color || defaultValues.color || "#2FF200");

  if (configValue.title !== "" && configValue.title !== null) {
    embed.setTitle(configValue.title || defaultValues.title);
  }

  if (configValue.URL !== "" && configValue.URL !== null) {
    embed.setURL(configValue.URL || defaultValues.URL);
  }

  if (configValue.image !== "" && configValue.image !== null) {
    embed.setImage(configValue.image || defaultValues.image);
  }

  if (configValue.thumbnail !== "" && configValue.thumbnail !== null) {
    embed.setThumbnail(configValue.thumbnail || defaultValues.thumbnail);
  }

  if (configValue.timestamp === true) {
    embed.setTimestamp();
  } else if (
    configValue.timestamp !== false &&
    defaultValues.timestamp === true
  ) {
    embed.setTimestamp();
  }

  // Setting author and footer
  if (configValue?.author?.name !== "" && configValue?.author?.name !== null) {
    const authorValues = {
      name: configValue?.author?.name || defaultValues.author?.name || null,
      url:
        configValue?.author?.url !== "" && configValue?.author?.url !== null
          ? configValue?.author?.url || defaultValues.author?.url
          : undefined,
      iconURL:
        configValue?.author?.iconURL !== "" &&
        configValue?.author?.iconURL !== null
          ? configValue?.author?.iconURL || defaultValues.author?.iconURL
          : undefined,
    };
    embed.setAuthor(authorValues);
  }

  if (configValue?.footer?.text !== "" && configValue?.footer?.text !== null) {
    const footerValues = {
      text: configValue?.footer?.text || defaultValues.footer?.text || null,
      iconURL:
        configValue?.footer?.iconURL !== "" &&
        configValue?.footer?.iconURL !== null
          ? configValue?.footer?.iconURL || defaultValues.footer?.iconURL
          : undefined,
    };
    embed.setFooter(footerValues);
  }

  return embed;
}

async function saveTranscript(interaction, message, saveImages = false) {
  const createTranscriptOptions = {
    limit: -1,
    saveImages,
    returnType: "buffer",
    poweredBy: false,
  };

  let channel;
  if (interaction) {
    channel = interaction.channel;
  } else if (message) {
    channel = message.channel;
  }

  if (channel) {
    const fileName = `${channel.name}-transcript.html`;
    const attachmentBuffer = await discordHtmlTranscripts.createTranscript(
      channel,
      {
        ...createTranscriptOptions,
        fileName,
      },
    );
    return new AttachmentBuilder(Buffer.from(attachmentBuffer), {
      name: fileName,
    });
  }

  return null;
}

async function saveTranscriptTxt(interaction) {
  const channel = interaction.channel;
  let lastId;
  let transcript = [];
  let totalFetched = 0;
  let ticketUserID = await getUser(
    await ticketsDB.get(`${interaction.channel.id}.userID`),
  );
  let claimUserID = await ticketsDB.get(`${interaction.channel.id}.claimUser`);
  let claimUser;

  if (claimUserID) {
    claimUser = await getUser(claimUserID);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const options = { limit: 100 };
    if (lastId) {
      options.before = lastId;
    }

    const fetched = await channel.messages.fetch(options);
    totalFetched += fetched.size;
    lastId = fetched.lastKey();

    const newLines = fetched.map((m) => {
      let messageText = `[${new Date(m.createdTimestamp).toLocaleString()}] ${m.author.username}: `;

      if (m.content) {
        messageText += m.content;
        if (m.attachments.size > 0) {
          messageText += " ";
        }
      }

      if (m.attachments.size > 0) {
        const attachmentText = m.attachments
          .map((attachment) => attachment.proxyURL)
          .join("\n");
        messageText += attachmentText;
      }

      if (m.embeds.length > 0) {
        const embedText = m.embeds
          .map((embed) => {
            let embedFields = "";

            if (embed.fields && embed.fields.length > 0) {
              embedFields = embed.fields
                .map((field) => `${field.name} : ${field.value}`)
                .join("\n");
            }

            let embedContent = "";
            if (embed.title) {
              embedContent += `Embed Title: ${embed.title}\n`;
            }
            if (embed.description) {
              embedContent += `Embed Description: ${embed.description}\n`;
            }
            if (embedFields) {
              embedContent += `${embedFields}\n`;
            }

            return embedContent.trim();
          })
          .filter((embedText) => embedText !== "")
          .join("\n");

        messageText += embedText;
      }

      return messageText;
    });

    transcript.push(...newLines);

    // break when there are no more messages
    if (fetched.size < 100) break;
  }

  const additionalInfo = `Server: ${interaction.guild.name}\nTicket: #${interaction.channel.name}\nCategory: ${await ticketsDB.get(`${channel.id}.ticketType`)}\nTicket Author: ${ticketUserID.tag}\nDeleted By: ${interaction.user.tag}\nClaimed By: ${claimUser ? claimUser.tag : "None"}\n`;
  const finalTranscript = [additionalInfo, ...transcript.reverse()];
  finalTranscript.push(`\nTotal messages: ${totalFetched}`);

  return new AttachmentBuilder(Buffer.from(finalTranscript.join("\n")), {
    name: `${channel.name}-transcript.txt`,
  });
}

async function countMessagesInTicket(channel, lastId = null) {
  let messageCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const options = { limit: 100 };
    if (lastId) {
      options.before = lastId;
    }

    const messages = await channel.messages.fetch(options);
    messageCount += messages.size;
    lastId = messages.lastKey();

    // break when there are no more messages
    if (messages.size < 100) break;
  }
  return messageCount;
}

// Function to check if the blacklisted user or role duration has expired
function isBlacklistExpired(timestamp, duration) {
  if (duration === "permanent" || duration === undefined) {
    return false; // Treat undefined or 'permanent' as permanent blacklist
  }
  const durationInMilliseconds = parseDurationToMilliseconds(duration);
  const expirationTime = timestamp + durationInMilliseconds;
  return Date.now() >= expirationTime;
}

async function cleanBlacklist() {
  const currentTime = Date.now();
  const blacklistedUsers = (await blacklistDB.all()) || [];
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const userArray = blacklistedUsers.filter(
    (entry) =>
      entry.id.startsWith("user-") && entry.value.duration !== "permanent",
  );
  const rolesArray = blacklistedUsers.filter(
    (entry) =>
      entry.id.startsWith("role-") && entry.value.duration !== "permanent",
  );

  if (userArray.length > 0) {
    for (const { id, value } of userArray) {
      const userId = id.split("-")[1];
      const member =
        guild.members.cache.get(userId) || (await guild.members.fetch(userId));
      const { timestamp, duration } = value;
      const expiryTime = timestamp + parseDurationToMilliseconds(duration);

      if (currentTime >= expiryTime) {
        await blacklistDB.delete(`user-${userId}`);
        const blacklistRoles = config.rolesOnBlacklist || [];
        blacklistRoles.forEach(async (roleId) => {
          const role = await getRole(roleId);
          if (role) {
            await member.roles
              .remove(role)
              .catch((error) =>
                console.error(
                  `Error removing role from blacklisted user: ${error}`,
                ),
              );
          } else {
            console.error(`Role with ID ${roleId} not found.`);
          }
        });
      }
    }
  }

  if (rolesArray.length > 0) {
    for (const { id, value } of rolesArray) {
      const roleId = id.split("-")[1];
      const { timestamp, duration } = value;
      const expiryTime = timestamp + parseDurationToMilliseconds(duration);

      if (currentTime >= expiryTime) {
        await blacklistDB.delete(`role-${roleId}`);
      }
    }
  }
}

const intervalInSeconds = config.blacklistCleanup || 120;
// Schedule the blacklist cleanup check every intervalInSeconds seconds
setInterval(cleanBlacklist, intervalInSeconds * 1000);

// Function to parse duration string to milliseconds
function parseDurationToMilliseconds(duration) {
  const unitMap = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000,
  };

  const numericValue = parseInt(duration, 10);
  const unit = duration.slice(-1);

  return numericValue * unitMap[unit] || 0;
}

async function getUserPreference(id, type) {
  const preference = await blacklistDB.get(`userPreference-${id}`);
  if (preference === undefined || preference === null) {
    return true;
  } else if (preference[type] === undefined) {
    return true;
  } else {
    return preference[type];
  }
}

// Time formatting function
function formatTime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  let result = "";
  if (d > 0) result += `${d}d `;
  if (h > 0) result += `${h}h `;
  if (m > 0) result += `${m}m `;
  if (s > 0 || result === "") result += `${s}s`;

  return result.trim();
}

// Logging function
async function logMessage(message) {
  const logMessage = `[${timeString}] [Bot v${packageJson.version}] [NodeJS ${process.version}] [LOG] ${message}\n\n`;

  try {
    await fs.promises.appendFile("./logs.txt", logMessage);
  } catch (err) {
    console.log("Error writing to log file:", err);
  }
}

// Sanitizing function
function sanitizeInput(input) {
  const formattingCharacters = ["_", "*", "`", "~", "|", "-"];
  const escapedInput = input.replace(
    new RegExp(`[${formattingCharacters.join("")}]`, "g"),
    "\\$&",
  );
  return escapedInput;
}

// Load environment variables
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

module.exports = {
  client,
  mainDB,
  ticketsDB,
  saveTranscript,
  logMessage,
  ticketCategories,
  sanitizeInput,
  reloadAllSlashCommands,
  saveTranscriptTxt,
  formatTime,
  checkSupportRole,
  configEmbed,
  blacklistDB,
  countMessagesInTicket,
  addTicketCreator,
  isBlacklistExpired,
  parseDurationToMilliseconds,
  getUser,
  findAvailableCategory,
  getRole,
  getPermissionOverwrites,
  getUserPreference,
};

// Holding commands cooldown data
client.cooldowns = new Collection();

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

// Function to log errors
async function logError(errorType, error) {
  const errorMessage = `[${timeString}] [Bot v${packageJson.version}] [NodeJS ${process.version}] [${errorType}]\n${error.stack}\n\n`;
  const logsFileToChannel = config?.logsFileToChannel ?? false;
  const logsFileChannelID = config?.logsFileChannelID ?? "";

  try {
    if (logsFileToChannel && logsFileChannelID) {
      const channel = client.channels.cache.get(logsFileChannelID);
      if (channel) {
        await channel.send(`\`\`\`${errorMessage}\`\`\``);
      } else {
        throw new Error("Channel not found for logging errors.");
      }
    } else {
      await fs.promises.appendFile("./logs.txt", errorMessage);
    }
  } catch (err) {
    console.log("Error writing to log file:", err);
  }
}

client.on("warn", async (error) => {
  console.log(error);
  logError("WARN", error);
});

client.on("error", async (error) => {
  console.log(error);
  logError("ERROR", error);
});

process.on("unhandledRejection", async (error) => {
  console.log(error);
  logError("unhandledRejection", error);
});

process.on("uncaughtException", async (error) => {
  console.log(error);
  logError("uncaughtException", error);
});

client.commands = new Collection();
const commands = [];
const commandFolders = fs.readdirSync("./commands");
for (const folder of commandFolders) {
  const commandFiles = fs
    .readdirSync(`./commands/${folder}`)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const command = require(`./commands/${folder}/${file}`);
    if (command.enabled) {
      commands.push(command.data.toJSON());
      console.log(`The slash command [${file}] has been loaded!`);
      client.commands.set(command.data.name, command);
    }
  }
}

client.on("ready", async () => {
  try {
    const rest = new REST({
      version: "10",
    }).setToken(process.env.BOT_TOKEN);

    (async () => {
      try {
        // Get the previously registered slash commands
        const registeredCommands = await rest.get(
          Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID,
          ),
        );

        // Filter out the new slash commands that are not already registered
        const newCommands = commands.filter((command) => {
          return !registeredCommands.some((registeredCommand) => {
            return registeredCommand.name === command.name;
          });
        });

        // Filter out the existing slash commands that are not in the new commands
        const removedCommands = registeredCommands.filter(
          (registeredCommand) => {
            return !commands.some((command) => {
              return command.name === registeredCommand.name;
            });
          },
        );

        // Register the new slash commands if there are any
        if (newCommands.length > 0) {
          await rest.put(
            Routes.applicationGuildCommands(
              process.env.CLIENT_ID,
              process.env.GUILD_ID,
            ),
            {
              body: commands,
            },
          );

          console.log("New slash commands registered successfully.");
          console.log(commands.map((command) => command.name));
        } else {
          console.log("No new slash commands to register.");
        }

        // Remove the existing slash commands if there are any
        if (removedCommands.length > 0) {
          await Promise.all(
            removedCommands.map((command) =>
              rest.delete(
                Routes.applicationGuildCommand(
                  process.env.CLIENT_ID,
                  process.env.GUILD_ID,
                  command.id,
                ),
              ),
            ),
          );

          console.log("Existing slash commands removed successfully.");
          console.log(removedCommands.map((command) => command.name));
        } else {
          console.log("No existing slash commands to remove.");
        }
      } catch (error) {
        if (error) {
          console.error(
            "An error occurred during slash command registration:",
            error,
          );
          console.log(
            `The bot may have been invited with some missing options. Please use the link below to re-invite your bot if that is the case.`,
          );
          console.log(
            `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=268823632&scope=bot%20applications.commands`,
          );
        }
      }
    })();

    const presence = {
      activities: [
        {
          name: config.status.botActivityText || "Support Tickets",
          type: ActivityType[config.status.botActivityType || "Watching"],
        },
      ],
      status: config.status.botStatus || "online",
    };

    if (config.status.botActivityType === "Streaming") {
      presence.activities[0].url = config.status.streamingOptionURL;
    }

    client.user.setPresence(presence);
    const keysToDelete = (await mainDB.startsWith("isClaimInProgress")).map(
      ({ id }) => id,
    );
    await Promise.all(
      keysToDelete.map(async (key) => {
        await mainDB.delete(key);
      }),
    );
    console.log(`The ticket bot is now ready! Logged in as ${client.user.tag}`);
  } catch (error) {
    console.error("An error occurred during initialization:", error);
  }
});

// Function to reload all slash commands
async function reloadAllSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID,
    ),
    {
      body: commands,
    },
  );

  console.log(
    "All slash commands have been reloaded! Please use with caution due to rate limits.",
  );
  console.log(commands.map((command) => command.name));
}

// Log in to Discord with your app's token
client.login(process.env.BOT_TOKEN).catch((error) => {
  if (error.message.includes("An invalid token was provided")) {
    console.log(error);
    logError("INVALID_TOKEN", error);
    process.exit();
  } else if (
    error.message.includes(
      "Privileged intent provided is not enabled or whitelisted.",
    )
  ) {
    console.log(error);
    logError("DISALLOWED_INTENTS", error);
    process.exit();
  } else {
    console.log(error);
    logError("ERROR", error);
    process.exit();
  }
});
