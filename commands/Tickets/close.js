const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { closeTicket } = require("../../utils/ticketClose.js");

module.exports = {
  enabled: config.commands.close.enabled,
  data: new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close a ticket.")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for closing the ticket")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.close.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
    ) {
      return interaction.reply({
        content: "This ticket is already closed!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    const reason =
      interaction.options.getString("reason") || "No reason provided.";
    await closeTicket(interaction, reason);
  },
};
