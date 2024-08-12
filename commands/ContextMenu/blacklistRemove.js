const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
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
        ephemeral: true,
      });
    }

    const member = interaction.targetMember;
    const user = member.user;
    const reason = "Unblacklisted using the Context Menu command";
    await interaction.deferReply({ ephemeral: true });
    await blacklistRemove(interaction, user, member, reason, null);
  },
};
