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
  enabled: config.contextMenuCommands.blacklistAdd.enabled,
  data: new ContextMenuCommandBuilder()
    .setName("Blacklist Add")
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.contextMenuCommands.blacklistAdd.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const user = interaction.targetUser;
    const reason = "Blacklisted using the Context Menu command";
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
        "**{target} ({target.tag})** has been added to the blacklist.\nReason: **{reason}**",
    };
    const blacklistedEmbedUser = await configEmbed(
      "blacklistSuccessEmbed",
      successDefault,
    );

    if (blacklistedEmbedUser.data && blacklistedEmbedUser.data.description) {
      blacklistedEmbedUser.setDescription(
        blacklistedEmbedUser.data.description
          .replace(/\{target\}/g, user)
          .replace(/\{target\.tag\}/g, sanitizeInput(user.tag))
          .replace(/\{reason\}/g, reason),
      );
    }

    const userExists = await blacklistDB.has(`user-${user.id}`);
    if (userExists) {
      // User is already blacklisted
      return interaction.editReply({
        embeds: [alreadyBlacklistedEmbedUser],
        ephemeral: true,
      });
    } else {
      // User is not blacklisted
      await blacklistDB.set(`user-${user.id}`, {
        reason: reason,
        timestamp: Date.now(),
        staff: interaction.user.id,
      });
      logMessage(
        `${interaction.user.tag} added ${user.tag} to the blacklist with reason ${reason}.`,
      );
      let logChannelId = config.logs.blacklistAdd || config.logs.default;
      let logChannel = interaction.guild.channels.cache.get(logChannelId);

      const logDefaultValues = {
        color: "#2FF200",
        title: "Ticket Logs | Target Blacklisted",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logBlacklistEmbed = await configEmbed(
        "logBlacklistEmbed",
        logDefaultValues,
      );

      logBlacklistEmbed.addFields([
        {
          name: config.logBlacklistEmbed.field_staff,
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logBlacklistEmbed.field_target,
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logBlacklistEmbed.field_reason,
          value: `> ${reason}`,
        },
      ]);
      await logChannel.send({ embeds: [logBlacklistEmbed] });

      return interaction.editReply({
        embeds: [blacklistedEmbedUser],
        ephemeral: true,
      });
    }
  },
};
