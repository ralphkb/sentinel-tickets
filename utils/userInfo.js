const { MessageFlags } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { configEmbed, sanitizeInput } = require("./mainUtils.js");

async function userInfo(interaction, member, isEphemeral) {
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
  const userRoles = member.roles.cache
    .filter((role) => role.id !== interaction.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => ` ${role}`)
    .join(", ");
  const userInfoEmbed = await configEmbed("userInfoEmbed", defaultValues);

  userInfoEmbed.addFields([
    {
      name: config.userInfoEmbed.field_info || "Information",
      value: `> **Username:** ${sanitizeInput(user.username)}\n> **Display Name:** ${member.displayName}\n> **User ID:** ${user.id}`,
    },
    {
      name: config.userInfoEmbed.field_avatar || "Avatar",
      value: `> ${avatarLinks}`,
    },
    {
      name: config.userInfoEmbed.field_roles || "Roles",
      value: userRoles
        ? `> ${userRoles}`
        : "> This user currently has no roles.",
    },
    {
      name: config.userInfoEmbed.field_createdAt || "Created At",
      value: `> ${createdAtTimestamp}`,
    },
    {
      name: config.userInfoEmbed.field_joinedAt || "Joined At",
      value: `> ${joinedAtTimestamp}`,
    },
  ]);

  await interaction.editReply({
    embeds: [userInfoEmbed],
    flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
  });
}

module.exports = {
  userInfo,
};
