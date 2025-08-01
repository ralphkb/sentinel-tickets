const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");




const { userInfo } = require("../../utils/userInfo.js");

module.exports = {
  enabled: config.commands.userInfo.enabled,
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get useful information about a user.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.userInfo.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    const isEphemeral =
      config.userInfoEmbed.ephemeral !== undefined
        ? config.userInfoEmbed.ephemeral
        : true;
    const user = interaction.options.getUser("user") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    await interaction.deferReply({
      flags: isEphemeral ? MessageFlags.Ephemeral : undefined,
    });
    await userInfo(interaction, member, isEphemeral);
  },
};
