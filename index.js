// Import necessary modules
const {
  Client,
  GatewayIntentBits,
  Collection,
  AttachmentBuilder,
  ActivityType,
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
const date = new Date();
const options = {
  timeZoneName: "short",
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

  // Initialize blacklistedUsers to an empty array if it doesn't exist
  if (!(await mainDB.has("blacklistedUsers"))) {
    await mainDB.set("blacklistedUsers", []);
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
    modalTitle,
    questions: extractedQuestions,
  };
});

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
  let transcript = "";

  // Add some useful information to the top of the transcript
  let ticketUserID = client.users.cache.get(
    await ticketsDB.get(`${interaction.channel.id}.userID`),
  );
  let claimUser = client.users.cache.get(
    await ticketsDB.get(`${interaction.channel.id}.claimUser`),
  );

  transcript += `Server: ${interaction.guild.name}\nTicket: #${interaction.channel.name}\nCategory: ${await ticketsDB.get(`${channel.id}.ticketType`)}\nTicket Author: ${ticketUserID.tag}\nDeleted By: ${interaction.user.tag}\nClaimed By: ${claimUser ? claimUser.tag : "None"}\n\n`;
  let totalFetched = 0;
  let checkpointLine = 7; // The line number where the writing begins on every iteration

  while (totalFetched < 400) {
    const options = { limit: 100 };
    if (lastId) {
      options.before = lastId;
    }

    const fetched = await channel.messages.fetch(options);
    if (fetched.size === 0) {
      break;
    }

    totalFetched += fetched.size;
    lastId = fetched.last().id;

    const newLines = fetched
      .map((m) => {
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
      })
      .reverse()
      .join("\n");

    // Insert the new lines at the specified checkpoint line
    const transcriptLines = transcript.split("\n");
    transcriptLines.splice(checkpointLine, 0, newLines);
    transcript = transcriptLines.join("\n");
  }

  transcript += `\n\nTotal messages: ${totalFetched}`;

  if (transcript.length < 1) {
    transcript = "The Transcript of this ticket is empty";
  }

  return new AttachmentBuilder(Buffer.from(transcript), {
    name: `${channel.name}-transcript.txt`,
  });
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

  try {
    await fs.promises.appendFile("./logs.txt", errorMessage);
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
          console.log(
            `The bot was invited with some missing options. Please use the link below to re-invite your bot.`,
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
          name: config.status.botActivityText,
          type: ActivityType[config.status.botActivityType],
        },
      ],
      status: config.status.botStatus,
    };

    if (config.status.botActivityType === "Streaming") {
      presence.activities[0].url = config.status.streamingOptionURL;
    }

    client.user.setPresence(presence);
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
