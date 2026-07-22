const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { pendingTicket } = require("../../utils/ticketPending.js");

module.exports = {
  enabled: config.commands.pending.enabled,
  data: new SlashCommandBuilder()
    .setName("pending")
    .setDescription(
      "Toggle the pending status of a ticket, moving it to or from the pending queue.",
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.pending.permission],
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
        content: "You cannot change the pending status of a closed ticket!",
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

    const isEphemeral =
      config.pendingEmbed?.ephemeral !== undefined
        ? config.pendingEmbed.ephemeral
        : false;

    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });

    try {
      await pendingTicket(interaction);
    } catch (error) {
      console.error("[Pending Command] Failed to toggle pending status:", error);
      const replyContent =
        config.errors.generic_error ||
        "An error occurred while toggling the pending status.";
      if (interaction.replied) {
        await interaction.followUp({ content: replyContent, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.editReply({ content: replyContent });
      }
    }
  },
};
