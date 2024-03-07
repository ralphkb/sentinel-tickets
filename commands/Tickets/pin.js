const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  ticketsDB,
  logMessage,
  checkSupportRole,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.pin.enabled,
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin the ticket channel in the category.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.pin.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    if (interaction.channel.name.includes(config.commands.pin.emoji)) {
      return interaction.reply({
        content: config.commands.pin.alreadyPinned,
        ephemeral: true,
      });
    }
    await interaction.deferReply();

    interaction.channel
      .setPosition(0)
      .then(() => {
        return new Promise((resolve) => setTimeout(resolve, 1000));
      })
      .then(() => {
        interaction.channel.setName(
          `${config.commands.pin.emoji}${interaction.channel.name}`,
        );
      });

    const defaultValues = {
      color: "#2FF200",
      description: "This ticket has been pinned.",
    };

    const pinEmbed = await configEmbed("pinEmbed", defaultValues);
    await interaction.editReply({ embeds: [pinEmbed] });
    logMessage(
      `${interaction.user.tag} pinned the ticket #${interaction.channel.name}`,
    );
  },
};
