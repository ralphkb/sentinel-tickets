const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB } = require("../../init.js");
const { getUser } = require("../../utils/mainUtils.js");
const { closeRequestTicket } = require("../../utils/ticketCloseRequest.js");

module.exports = {
  enabled: config.commands.closerequest.enabled,
  data: new SlashCommandBuilder()
    .setName("closerequest")
    .setDescription("Request closing a ticket.")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for requesting closing the ticket")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.closerequest.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!config.closeStaffOnly) {
      return interaction.reply({
        content:
          "This feature is currently disabled because you have the permission to close your own ticket.",
        ephemeral: true,
      });
    }

    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.status`)) === "Closed"
    ) {
      return interaction.reply({
        content: "This ticket is already closed!",
        ephemeral: true,
      });
    }

    let ticketUserID = await getUser(
      await ticketsDB.get(`${interaction.channel.id}.userID`),
    );
    if (interaction.user !== ticketUserID) {
      return interaction.reply({
        content: "You are not the ticket creator!",
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    const reason =
      interaction.options.getString("reason") || "No reason provided.";
    await closeRequestTicket(interaction, reason);
  },
};
