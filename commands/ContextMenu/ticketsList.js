const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");


const fs = require("fs");

const { listUserTickets } = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketsList.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Tickets List")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketsList.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    let user = interaction.targetUser || interaction.user;

    if (user.bot) {
      return interaction.reply({
        content: "Bots cannot have tickets.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (user !== interaction.user) {
      if (
        config.commands.tickets.support_role_ids.length === 0 ||
        !interaction.member.roles.cache.some((role) =>
          config.commands.tickets.support_role_ids.includes(role.id),
        )
      ) {
        return interaction.reply({
          content:
            config.errors.not_allowed || "You are not allowed to use this!",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const isEphemeral =
      config.ticketsEmbed.ephemeral !== undefined
        ? config.ticketsEmbed.ephemeral
        : true;
    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    await listUserTickets(interaction, user, isEphemeral);
  },
};
