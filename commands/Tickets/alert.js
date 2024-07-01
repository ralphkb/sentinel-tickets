const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB } = require("../../init.js");
const { checkSupportRole, getUser } = require("../../utils/mainUtils.js");
const { alertTicket } = require("../../utils/ticketAlert.js");

module.exports = {
  enabled: config.commands.alert.enabled,
  data: new SlashCommandBuilder()
    .setName("alert")
    .setDescription("Alert the ticket creator.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.alert.permission],
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

    let user =
      interaction.options.getUser("user") ||
      (await getUser(await ticketsDB.get(`${interaction.channel.id}.userID`)));

    if (user.bot) {
      return interaction.reply({
        content: "You cannot send a ticket alert to a bot.",
        ephemeral: true,
      });
    }

    if (!interaction.channel.members.has(user.id)) {
      return interaction.reply({
        content: "The selected user is not added to this ticket!",
        ephemeral: true,
      });
    }
    await interaction.deferReply();
    await alertTicket(interaction, user);
  },
};
