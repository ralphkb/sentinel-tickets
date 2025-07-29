const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const fs = require("fs");


const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { transcriptTicket } = require("../../utils/ticketTranscript.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketTranscript.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Transcript")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[
        config.contextMenuCommands.ticketTranscript.permission
      ],
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
    const isEphemeral =
      config.transcriptReplyEmbed.ephemeral !== undefined
        ? config.transcriptReplyEmbed.ephemeral
        : true;
    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    await transcriptTicket(interaction);
  },
};
