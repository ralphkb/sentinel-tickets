const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");




const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { pinTicket } = require("../../utils/ticketPin.js");

module.exports = {
  enabled: config.contextMenuCommands.ticketPin.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Ticket Pin")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.ticketPin.permission],
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

    const pinEmoji = config?.commands?.pin?.emoji || "📌";

    if (interaction.channel.name.includes(pinEmoji)) {
      return interaction.reply({
        content:
          config.commands.pin.alreadyPinned || "This ticket is already pinned!",
        flags: MessageFlags.Ephemeral,
      });
    }
    const isEphemeral =
      config.pinEmbed.ephemeral !== undefined
        ? config.pinEmbed.ephemeral
        : false;
    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    await pinTicket(interaction, pinEmoji, isEphemeral);
  },
};
