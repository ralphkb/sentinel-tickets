const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { blacklistAdd } = require("../../utils/userBlacklist.js");
module.exports = {
  enabled: config.contextMenuCommands.blacklistAdd.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Blacklist Add")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.blacklistAdd.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (
      !interaction.member.roles.cache.some((role) =>
        config.rolesThatCanBlacklist.includes(role.id),
      )
    ) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = interaction.targetMember;
    const user = member.user;
    const reason = "Blacklisted using the Context Menu command";
    const duration = "permanent";
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await blacklistAdd(interaction, user, member, duration, reason, null);
  },
};
