const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { blacklistRemove } = require("../../utils/userBlacklist.js");
module.exports = {
  enabled: config.contextMenuCommands.blacklistRemove.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Blacklist Remove")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[
        config.contextMenuCommands.blacklistRemove.permission
      ],
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
    const reason = "Unblacklisted using the Context Menu command";
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await blacklistRemove(interaction, user, member, reason, null);
  },
};
