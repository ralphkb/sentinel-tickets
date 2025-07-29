const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB, mainDB } = require("../../init.js");
const { checkSupportRole, getUser } = require("../../utils/mainUtils.js");
const { claimTicket } = require("../../utils/ticketClaim.js");
const fs = require("fs");
module.exports = {
  enabled: config.contextMenuCommands.ticketClaim.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Claim")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketClaim.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const claimKey = `isClaimInProgress-${interaction.channel.id}`;
    const isClaimInProgress = await mainDB.get(claimKey);
    if (isClaimInProgress) {
      return interaction.reply({
        content: "Another user is already claiming this ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await mainDB.set(claimKey, true);

    if (!(await ticketsDB.has(interaction.channel.id))) {
      await mainDB.delete(claimKey).catch((error) => {
        console.error(
          `Error deleting claim key for ticket #${interaction.channel.name}:`,
          error,
        );
      });
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      await mainDB.delete(claimKey).catch((error) => {
        console.error(
          `Error deleting claim key for ticket #${interaction.channel.name}:`,
          error,
        );
      });
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (config.claimFeature === false) {
      await mainDB.delete(claimKey).catch((error) => {
        console.error(
          `Error deleting claim key for ticket #${interaction.channel.name}:`,
          error,
        );
      });
      return interaction.reply({
        content: "The claim feature is currently disabled.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let claimStatus = await ticketsDB.get(`${interaction.channel.id}.claimed`);
    let claimUserID = await ticketsDB.get(
      `${interaction.channel.id}.claimUser`,
    );
    let claimUser;

    if (claimUserID) {
      claimUser = await getUser(claimUserID);
    }

    if (claimStatus) {
      await mainDB.delete(claimKey).catch((error) => {
        console.error(
          `Error deleting claim key for ticket #${interaction.channel.name}:`,
          error,
        );
      });
      return interaction.reply({
        content: `This ticket has already been claimed by ${claimUser}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
    ) {
      await mainDB.delete(claimKey).catch((error) => {
        console.error(
          `Error deleting claim key for ticket #${interaction.channel.name}:`,
          error,
        );
      });
      return interaction.reply({
        content: "You cannot claim a closed ticket!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await claimTicket(interaction);
  },
};
