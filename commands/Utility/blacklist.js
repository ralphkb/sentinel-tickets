const {
  EmbedBuilder,
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { mainDB, sanitizeInput, logMessage } = require("../../index.js");

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
        config.support_role_ids.includes(role.id),
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
      const alreadyBlacklistedEmbedUser = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedFailed.color)
        .setDescription(
          `${config.commands.blacklist.embedFailed.description}`
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );

      const blacklistedEmbedUser = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedSuccess.color)
        .setDescription(
          `${config.commands.blacklist.embedSuccess.description}`
            .replace(/\{target\}/g, user)
            .replace(/\{target\.tag\}/g, sanitizeInput(user.tag)),
        );

      if (blacklistedUsers.includes(user.id)) {
        // User is already blacklisted
        return interaction.reply({
          embeds: [alreadyBlacklistedEmbedUser],
          ephemeral: true,
        });
      }

      // User is not blacklisted
      await mainDB.push("blacklistedUsers", user.id);
      interaction.reply({ embeds: [blacklistedEmbedUser], ephemeral: true });
      logMessage(`${interaction.user.tag} added ${user.tag} to the blacklist.`);
    }

    if (role) {
      const alreadyBlacklistedEmbedRole = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedFailed.color)
        .setDescription(
          `${config.commands.blacklist.embedFailed.description}`
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );

      const blacklistedEmbedRole = new EmbedBuilder()
        .setColor(config.commands.blacklist.embedSuccess.color)
        .setDescription(
          `${config.commands.blacklist.embedSuccess.description}`
            .replace(/\{target\}/g, role)
            .replace(/\{target\.tag\}/g, sanitizeInput(role.name)),
        );

      if (blacklistedUsers.includes(role.id)) {
        // Role is already blacklisted
        return interaction.reply({
          embeds: [alreadyBlacklistedEmbedRole],
          ephemeral: true,
        });
      }

      // Role is not blacklisted
      await mainDB.push("blacklistedUsers", role.id);
      interaction.reply({ embeds: [blacklistedEmbedRole], ephemeral: true });
      logMessage(
        `${interaction.user.tag} added ${role.name} to the blacklist.`,
      );
    }
  },
};
