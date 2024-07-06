const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { blacklistDB } = require("../../init.js");
const { configEmbed } = require("../../utils/mainUtils.js");

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

      const defaultValues = {
        color: "#2FF200",
        title: "User Preference",
        description: "You will now {result}receive **{action}** DMs.",
        timestamp: true,
        footer: {
          text: `Preference of ${interaction.user.username}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const preferenceEmbed = await configEmbed(
        "preferenceEmbed",
        defaultValues,
      );

      if (preferenceEmbed.data && preferenceEmbed.data.description) {
        preferenceEmbed.setDescription(
          preferenceEmbed.data.description
            .replace(/\{result\}/g, `${enabled ? "" : "no longer "}`)
            .replace(/\{action\}/g, action),
        );
      }

      await interaction.editReply({
        embeds: [preferenceEmbed],
        ephemeral: true,
      });
    }
  },
};
