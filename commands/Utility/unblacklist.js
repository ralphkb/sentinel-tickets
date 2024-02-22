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
  enabled: config.commands.unblacklist.enabled,
  data: new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Remove a user or role from the blacklist.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Select a user").setRequired(false),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Select a role").setRequired(false),
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.unblacklist.permission],
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

    if ((!user && !role) || (user && role)) {
      return interaction.reply({
        content: "Please provide either a user or a role, but not both.",
        ephemeral: true,
      });
    }

    const blacklistedUsers = await mainDB.get("blacklistedUsers");

    if (user) {
      const failedDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** is not currently in the blacklist.",
      };
      const notBlacklistedEmbedUser = await configEmbed(
        "unblacklistFailedEmbed",
        failedDefault,
      );

      if (
        notBlacklistedEmbedUser.data &&
        notBlacklistedEmbedUser.data.description
      ) {
        notBlacklistedEmbedUser.setDescription(
          notBlacklistedEmbedUser.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );
      }

      const successDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** has been removed from the blacklist.",
      };
      const unblacklistedEmbedUser = await configEmbed(
        "unblacklistSuccessEmbed",
        successDefault,
      );

      if (
        unblacklistedEmbedUser.data &&
        unblacklistedEmbedUser.data.description
      ) {
        unblacklistedEmbedUser.setDescription(
          unblacklistedEmbedUser.data.description
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );
      }

      if (blacklistedUsers.includes(user.id)) {
        // User is blacklisted
        await mainDB.pull("blacklistedUsers", user.id);
        logMessage(
          `${interaction.user.tag} removed ${user.tag} from the blacklist.`,
        );
        return interaction.reply({
          embeds: [unblacklistedEmbedUser],
          ephemeral: true,
        });
      }

      // User is not blacklisted
      return interaction.reply({
        embeds: [notBlacklistedEmbedUser],
        ephemeral: true,
      });
    }

    if (role) {
      const failedDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** is not currently in the blacklist.",
      };
      const notBlacklistedEmbedRole = await configEmbed(
        "unblacklistFailedEmbed",
        failedDefault,
      );

      if (
        notBlacklistedEmbedRole.data &&
        notBlacklistedEmbedRole.data.description
      ) {
        notBlacklistedEmbedRole.setDescription(
          notBlacklistedEmbedRole.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );
      }

      const successDefault = {
        color: "#2FF200",
        description:
          "**{target} ({target.tag})** has been removed from the blacklist.",
      };
      const unblacklistedEmbedRole = await configEmbed(
        "unblacklistSuccessEmbed",
        successDefault,
      );

      if (
        unblacklistedEmbedRole.data &&
        unblacklistedEmbedRole.data.description
      ) {
        unblacklistedEmbedRole.setDescription(
          unblacklistedEmbedRole.data.description
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );
      }

      if (blacklistedUsers.includes(role.id)) {
        // User is blacklisted
        await mainDB.pull("blacklistedUsers", role.id);
        logMessage(
          `${interaction.user.tag} removed ${role.name} from the blacklist.`,
        );
        return interaction.reply({
          embeds: [unblacklistedEmbedRole],
          ephemeral: true,
        });
      }

      // User is not blacklisted
      return interaction.reply({
        embeds: [notBlacklistedEmbedRole],
        ephemeral: true,
      });
    }
  },
};
