const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { unclaimTicket } = require("../../utils/ticketUnclaim.js");

module.exports = {
  enabled: config.commands.unclaim.enabled,
  data: new SlashCommandBuilder()
    .setName("unclaim")
    .setDescription("Unclaim a ticket")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.unclaim.permission],
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

    if (config.claimFeature === false) {
      return interaction.reply({
        content: "The claim feature is currently disabled.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if ((await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false) {
      return interaction.reply({
        content: "This ticket has not been claimed!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
      interaction.user.id
    ) {
      return interaction.reply({
        content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await unclaimTicket(interaction);
  },
};
