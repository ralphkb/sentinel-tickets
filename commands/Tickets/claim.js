const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB, mainDB } = require("../../init.js");
const { checkSupportRole, getUser } = require("../../utils/mainUtils.js");
const { claimTicket } = require("../../utils/ticketClaim.js");

module.exports = {
  enabled: config.commands.claim.enabled,
  data: new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim a ticket")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.claim.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const claimKey = `isClaimInProgress-${interaction.channel.id}`;
    const isClaimInProgress = await mainDB.get(claimKey);
    if (isClaimInProgress) {
      return interaction.reply({
        content: "Another user is already claiming this ticket.",
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
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
        ephemeral: true,
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
        content: `This ticket has already been claimed by <@!${claimUser}>`,
        ephemeral: true,
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
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    await claimTicket(interaction);
  },
};
