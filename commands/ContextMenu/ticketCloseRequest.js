const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const { ticketsDB } = require("../../init.js");
const { getUser } = require("../../utils/mainUtils.js");
const { closeRequestTicket } = require("../../utils/ticketCloseRequest.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketCloseRequest.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Close Request")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[
        config.contextMenuCommands.ticketCloseRequest.permission
      ],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!config.closeStaffOnly) {
      return interaction.reply({
        content:
          "This feature is currently disabled because you have the permission to close your own ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }

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

    let ticketUserID = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    if (interaction.user !== ticketUserID) {
      return interaction.reply({
        content: "You are not the ticket creator!",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply();
    await closeRequestTicket(interaction);
  },
};
