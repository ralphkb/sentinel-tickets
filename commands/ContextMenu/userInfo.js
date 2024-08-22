const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { userInfo } = require("../../utils/userInfo.js");

module.exports = {
  enabled: config.contextMenuCommands.userInfo.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("User Info")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.userInfo.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const isEphemeral =
      config.userInfoEmbed.ephemeral !== undefined
        ? config.userInfoEmbed.ephemeral
        : true;
    const member = interaction.targetMember;
    await interaction.deferReply({ ephemeral: isEphemeral });
    await userInfo(interaction, member, isEphemeral);
  },
};
