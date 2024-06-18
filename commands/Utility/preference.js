const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { blacklistDB } = require("../../init.js");

module.exports = {
  enabled: config.commands.preference.enabled,
  data: new SlashCommandBuilder()
    .setName("preference")
    .setDescription("Modify your preferences.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("dm")
        .setDescription("Modify your preferences for DMs.")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Choose a DM type.")
            .setRequired(true)
            .addChoices(
              { name: "Alert", value: "alert" },
              { name: "Reopen", value: "reopen" },
              { name: "Close", value: "close" },
              { name: "Delete", value: "delete" },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("enabled")
            .setDescription("Choose whether you want to receive these DMs.")
            .setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.preference.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === "dm") {
      await interaction.deferReply({ ephemeral: true });
      const action = interaction.options.getString("type");
      const enabled = interaction.options.getBoolean("enabled");
      const id = interaction.user.id;
      const userPreferences =
        (await blacklistDB.get(`userPreference-${id}`)) || {};
      userPreferences[action] = enabled;
      await blacklistDB.set(`userPreference-${id}`, userPreferences);
      await interaction.editReply({
        content: `You will now ${enabled ? "" : "no longer "}receive **${action}** DMs.`,
        ephemeral: true,
      });
    }
  },
};
