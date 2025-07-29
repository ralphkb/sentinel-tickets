const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");




const { listUserTickets } = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.tickets.enabled,
  data: new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("List the current tickets of a user.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.tickets.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    let user = interaction.options.getUser("user") || interaction.user;
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
