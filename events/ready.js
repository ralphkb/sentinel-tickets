const { Events, ActivityType } = require("discord.js");
const dotenv = require("dotenv");
dotenv.config();
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { client, mainDB } = require("../init.js");

module.exports = {
  name: Events.ClientReady,
  async execute() {
    try {
      const rest = new REST({
        version: "10",
      }).setToken(process.env.BOT_TOKEN);
      const commands = Array.from(client.commands.values()).map((command) =>
        command.data.toJSON(),
      );

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
            error.errorContext = `[Commands Registration Error]: an error occurred during slash command registration`;
            client.emit("error", error);
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
      console.log(
        `The ticket bot is now ready! Logged in as ${client.user.tag}`,
      );
    } catch (error) {
      error.errorContext = `[Ready Event Error]: an error occurred during initialization`;
      client.emit("error", error);
    }
  },
};
