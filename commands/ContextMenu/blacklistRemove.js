const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  PermissionFlagsBits,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const {
  sanitizeInput,
  configEmbed,
  logMessage,
  blacklistDB,
} = require("../../index.js");

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
    await interaction.deferReply({ ephemeral: true });
    const user = interaction.targetUser;
    const reason = "Unblacklisted using the Context Menu command";
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
        "**{target} ({target.tag})** has been removed from the blacklist.\nReason: **{reason}**",
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
          .replace(/\{target\.tag\}/g, sanitizeInput(user.tag))
          .replace(/\{reason\}/g, reason),
      );
    }

    const userExists = await blacklistDB.has(`user-${user.id}`);
    if (!userExists) {
      // User is not blacklisted
      return interaction.editReply({
        embeds: [notBlacklistedEmbedUser],
        ephemeral: true,
      });
    } else {
      // User is blacklisted
      await blacklistDB.delete(`user-${user.id}`);
      logMessage(
        `${interaction.user.tag} removed ${user.tag} from the blacklist with reason ${reason}.`,
      );
      let logChannelId = config.logs.blacklistRemove || config.logs.default;
      let logChannel = interaction.guild.channels.cache.get(logChannelId);

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Target Unblacklisted",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logUnblacklistEmbed = await configEmbed(
        "logUnblacklistEmbed",
        logDefaultValues,
      );

      logUnblacklistEmbed.addFields([
        {
          name: config.logUnblacklistEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_target,
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);
      if (config.toggleLogs.blacklistRemove) {
        await logChannel.send({ embeds: [logUnblacklistEmbed] });
      }

      return interaction.editReply({
        embeds: [unblacklistedEmbedUser],
        ephemeral: true,
      });
    }
  },
};
