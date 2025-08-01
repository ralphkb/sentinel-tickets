const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { deleteTicket } = require("../../utils/ticketDelete.js");

module.exports = {
  enabled: config.commands.delete.enabled,
  data: new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Delete a ticket.")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for deleting the ticket")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.delete.permission],
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
    await deleteTicket(interaction, reason);
  },
};
