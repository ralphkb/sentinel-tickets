const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const dotenv = require("dotenv");
dotenv.config();
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { client } = require("../../init.js");
const { logMessage } = require("../../utils/mainUtils.js");

module.exports = {
  enabled: true,
  data: new SlashCommandBuilder()
    .setName("reload")
    .setDescription("Reload all the slash commands.")
    .setDefaultMemberPermissions(PermissionFlagsBits["ManageChannels"])
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      {
        body: Array.from(client.commands.values()).map((command) =>
          command.data.toJSON(),
        ),
      },
    );
    console.log(
      "All slash commands have been reloaded! Please use with caution due to rate limits.",
    );
    console.log(
      Array.from(client.commands.values()).map((command) => command.data.name),
    );
    await interaction.editReply({
      content:
        "Reloaded all slash commands, use with caution due to rate limits. This command should only be used if you had issues loading slash commands changes due to bot updates.",
      ephemeral: true,
    });
    await logMessage(
      `${interaction.user.tag} reloaded all the slash commands.`,
    );
  },
};
