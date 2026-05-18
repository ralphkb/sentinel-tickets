const { Events, ActivityType } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { client, mainDB } = require("../init.js");
const { logMessage } = require("../utils/mainUtils.js");
const crypto = require("crypto");

module.exports = {
  name: Events.ClientReady,
  async execute() {
    try {
      const rest = new REST({
        version: "10",
      }).setToken(process.env.BOT_TOKEN);
      const commands = Array.from(client.commands.values())
        .map((command) => command.data.toJSON())
        .sort((a, b) => a.name.localeCompare(b.name));

      (async () => {
        try {
          const commandsHash = crypto
            .createHash("md5")
            .update(JSON.stringify(commands))
            .digest("hex");
          const lastHash = await mainDB.get("commandsHash");

          if (lastHash !== commandsHash) {
            await rest.put(
              Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID,
              ),
              {
                body: commands,
              },
            );

            await mainDB.set("commandsHash", commandsHash);
            console.log("Slash commands registered successfully.");
          } else {
            if (!config.silentStartup) {
              console.log(
                "No changes detected in slash commands, skipping registration.",
              );
            }
          }
        } catch (error) {
          if (error) {
            error.errorContext = `[Commands Registration Error]: an error occurred during slash command registration`;
            client.emit("error", error);
            console.log(
              'If you received an error saying "Unknown Application" then double check your client ID and guild ID in your .env file.',
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

      // Startup cleanup tasks in parallel
      await Promise.all([
        (async () => {
          // Delete any possible leftover claim keys
          const keysToDelete = (
            await mainDB.startsWith("isClaimInProgress")
          ).map(({ id }) => id);
          await Promise.all(keysToDelete.map((key) => mainDB.delete(key)));
        })(),
        (async () => {
          // Convert openTickets from an array to a number - from older versions
          const openTickets = (await mainDB.get("openTickets")) ?? 0;
          if (Array.isArray(openTickets)) {
            await mainDB.set("openTickets", openTickets.length);
          }
        })(),
      ]);

      const totalCommands = client.commands.size;
      const now = Date.now();
      const startupTime = (now - client.startingTime) / 1000;
      console.log(
        `The ticket bot is now ready! Logged in as ${client.user.tag}. Startup time was ${startupTime.toFixed(2)} seconds. A total of ${totalCommands} commands were loaded.`,
      );
      await logMessage(
        `The ticket bot is now ready! Logged in as ${client.user.tag}. Startup time was ${startupTime.toFixed(2)} seconds. A total of ${totalCommands} commands were loaded.`,
      );
    } catch (error) {
      error.errorContext = `[Ready Event Error]: an error occurred during initialization`;
      client.emit("error", error);
    }
  },
};
