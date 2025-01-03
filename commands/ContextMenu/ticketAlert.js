const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB } = require("../../init.js");
const { checkSupportRole, getUser } = require("../../utils/mainUtils.js");
const { alertTicket } = require("../../utils/ticketAlert.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketAlert.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Alert")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketAlert.permission],
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

    const member = interaction.targetMember;
    const user =
      member.user ||
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
    await alertTicket(interaction, user);
  },
};
