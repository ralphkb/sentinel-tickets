const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  mainDB,
  sanitizeInput,
  logMessage,
  configEmbed,
} = require("../../index.js");

module.exports = {
  enabled: config.commands.blacklist.enabled,
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Add a user or role to the blacklist.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Select a role").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.blacklist.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (
      !interaction.member.roles.cache.some((role) =>
        config.rolesThatCanBlacklist.includes(role.id),
      )
    ) {
      return interaction.reply({
        content: config.errors.not_allowed,
        ephemeral: true,
      });
    }

    let user = interaction.options.getUser("user");
    let role = interaction.options.getRole("role");
    await interaction.deferReply({ ephemeral: true });

    if ((!user && !role) || (user && role)) {
      return interaction.editReply({
        content: "Please provide either a user or a role, but not both.",
        ephemeral: true,
      });
    }

    const blacklistedUsers = await mainDB.get("blacklistedUsers");

    if (user) {
      const failedDefault = {
        color: "#2FF200",
        description: "**{target} ({target.tag})** is already in the blacklist.",
      };
      const alreadyBlacklistedEmbedUser = await configEmbed(
        "blacklistFailedEmbed",
        failedDefault,
      );

      if (
        alreadyBlacklistedEmbedUser.data &&
        alreadyBlacklistedEmbedUser.data.description
      ) {
        alreadyBlacklistedEmbedUser.setDescription(
          alreadyBlacklistedEmbedUser.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );
      }

      const successDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** has been added to the blacklist.",
      };
      const blacklistedEmbedUser = await configEmbed(
        "blacklistSuccessEmbed",
        successDefault,
      );

      if (blacklistedEmbedUser.data && blacklistedEmbedUser.data.description) {
        blacklistedEmbedUser.setDescription(
          blacklistedEmbedUser.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );
      }

      if (blacklistedUsers.includes(user.id)) {
        // User is already blacklisted
        return interaction.editReply({
          embeds: [alreadyBlacklistedEmbedUser],
          ephemeral: true,
        });
      }

      // User is not blacklisted
      await mainDB.push("blacklistedUsers", user.id);
      await interaction.editReply({
        embeds: [blacklistedEmbedUser],
        ephemeral: true,
      });
      logMessage(`${interaction.user.tag} added ${user.tag} to the blacklist.`);
    }

    if (role) {
      const failedDefault = {
        color: "#2FF200",
        description: "**{target} ({target.tag})** is already in the blacklist.",
      };
      const alreadyBlacklistedEmbedRole = await configEmbed(
        "blacklistFailedEmbed",
        failedDefault,
      );

      if (
        alreadyBlacklistedEmbedRole.data &&
        alreadyBlacklistedEmbedRole.data.description
      ) {
        alreadyBlacklistedEmbedRole.setDescription(
          alreadyBlacklistedEmbedRole.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );
      }

      const successDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** has been added to the blacklist.",
      };
      const blacklistedEmbedRole = await configEmbed(
        "blacklistSuccessEmbed",
        successDefault,
      );

      if (blacklistedEmbedRole.data && blacklistedEmbedRole.data.description) {
        blacklistedEmbedRole.setDescription(
          blacklistedEmbedRole.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );
      }

      if (blacklistedUsers.includes(role.id)) {
        // Role is already blacklisted
        return interaction.editReply({
          embeds: [alreadyBlacklistedEmbedRole],
          ephemeral: true,
        });
      }

      // Role is not blacklisted
      await mainDB.push("blacklistedUsers", role.id);
      await interaction.editReply({
        embeds: [blacklistedEmbedRole],
        ephemeral: true,
      });
      logMessage(
        `${interaction.user.tag} added ${role.name} to the blacklist.`,
      );
    }
  },
};
