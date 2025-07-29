const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");


const fs = require("fs");

const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { pinTicket } = require("../../utils/ticketPin.js");

module.exports = {
  enabled: config.commands.pin.enabled,
  data: new SlashCommandBuilder()
    .setName("pin")
    .setDescription("Pin the ticket channel in the category.")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.pin.permission],
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
