const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { sanitizeInput, configEmbed } = require("../../index.js");

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
    await interaction.deferReply({ ephemeral: true });
    const member = interaction.targetMember;
    const user = member.user;
    const joinedAtTimestamp = `<t:${Math.floor(member.joinedAt / 1000)}:F>`;
    const createdAtTimestamp = `<t:${Math.floor(user.createdAt / 1000)}:F>`;
    const jpgURL = user.displayAvatarURL({
      extension: "jpg",
      size: 1024,
    });
    const pngURL = user.displayAvatarURL({
      extension: "png",
      size: 1024,
    });
    const webpURL = user.displayAvatarURL({
      extension: "webp",
      size: 1024,
    });
    const avatarLinks = `[JPG](${jpgURL}) | [PNG](${pngURL}) | [WEBP](${webpURL})`;
    const defaultValues = {
      color: "#2FF200",
      title: "User Information",
      timestamp: true,
      thumbnail: `${pngURL}`,
      footer: {
        text: `${user.tag}`,
        iconURL: `${pngURL}`,
      },
    };

    const userInfoEmbed = await configEmbed("userInfoEmbed", defaultValues);

    userInfoEmbed.addFields([
      {
        name: "Information",
        value: `> **Username:** ${sanitizeInput(user.username)}\n> **User ID:** ${user.id}`,
      },
      {
        name: "Avatar",
        value: `> ${avatarLinks}`,
      },
      {
        name: "Created At",
        value: `> ${createdAtTimestamp}`,
      },
      {
        name: "Joined At",
        value: `> ${joinedAtTimestamp}`,
      },
    ]);

    await interaction.editReply({ embeds: [userInfoEmbed], ephemeral: true });
  },
};
