const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");




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
    .addIntegerOption((option) =>
      option
        .setName("time")
        .setDescription("Input a time in seconds")
        .setRequired(false)
        .setMinValue(30),
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

    let user =
      interaction.options.getUser("user") ||
      (await getUser(await ticketsDB.get(`${interaction.channel.id}.userID`)));

    if (user.bot) {
      return interaction.reply({
        content: "You cannot send a ticket alert to a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.channel.members.has(user.id)) {
      return interaction.reply({
        content: "The selected user is not added to this ticket!",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply();
    const time = interaction.options.getInteger("time");
    await alertTicket(interaction, user, time);
  },
};
