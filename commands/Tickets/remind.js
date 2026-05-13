const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB } = require("../../init.js");
const { checkSupportRole, getUser } = require("../../utils/mainUtils.js");
const { remindTicket } = require("../../utils/ticketRemind.js");

module.exports = {
  enabled: config.commands.remind.enabled,
  data: new SlashCommandBuilder()
    .setName("remind")
    .setDescription("Remind the ticket creator.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.remind.permission],
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
        content: "You cannot send a ticket reminder to a bot.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!interaction.channel.members.has(user.id)) {
      return interaction.reply({
        content: "The selected user is not added to this ticket!",
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.deferReply({
      flags: config.commands.remind.sendTicketMessage
        ? undefined
        : MessageFlags.Ephemeral,
    });
    await remindTicket(interaction, user);
  },
};
