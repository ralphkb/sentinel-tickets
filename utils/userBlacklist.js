const { MessageFlags } = require("discord.js");




const { blacklistDB, client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
  getRole,
} = require("./mainUtils.js");

async function blacklistAdd(
  interaction,
  user,
  member,
  duration,
  reason = "No reason provided.",
  role = null,
) {
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
        "**{target} ({target.tag})** has been added to the blacklist.\nReason: **{reason}**\nDuration: **{duration}**",
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
          .replace(/\{reason\}/g, reason)
          .replace(/\{duration\}/g, duration),
      );
    }

    const userExists = await blacklistDB.has(`user-${user.id}`);
    if (userExists) {
      // User is already blacklisted
      return interaction.editReply({
        embeds: [alreadyBlacklistedEmbedUser],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // User is not blacklisted
      await blacklistDB.set(`user-${user.id}`, {
        reason: reason,
        timestamp: Date.now(),
        staff: interaction.user.id,
        duration: duration,
      });
      const blacklistRoles = config.rolesOnBlacklist || [];
      blacklistRoles.forEach(async (roleId) => {
        const role = await getRole(roleId);
        if (role) {
          await member.roles
            .add(role)
            .catch((error) =>
              console.error(`Error adding role to blacklisted user: ${error}`),
            );
        } else {
          console.error(`Role with ID ${roleId} not found.`);
        }
      });
      await logMessage(
        `${interaction.user.tag} added ${user.tag} to the blacklist with reason ${reason} and duration ${duration}.`,
      );
      let logChannelId = config.logs.blacklistAdd || config.logs.default;
      let logChannel = await getChannel(logChannelId);

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
          name: config.logBlacklistEmbed.field_staff || "• Staff",
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logBlacklistEmbed.field_target || "• Target",
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logBlacklistEmbed.field_reason || "• Reason",
          value: `> ${reason}`,
        },
        {
          name: config.logBlacklistEmbed.field_duration || "• Duration",
          value: `> ${duration}`,
        },
      ]);
      if (config.toggleLogs.blacklistAdd) {
        try {
          await logChannel.send({ embeds: [logBlacklistEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }

      return interaction.editReply({
        embeds: [blacklistedEmbedUser],
        flags: MessageFlags.Ephemeral,
      });
    }
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
        "**{target} ({target.tag})** has been added to the blacklist.\nReason: **{reason}**\nDuration: **{duration}**",
    };
    const blacklistedEmbedRole = await configEmbed(
      "blacklistSuccessEmbed",
      successDefault,
    );

    if (blacklistedEmbedRole.data && blacklistedEmbedRole.data.description) {
      blacklistedEmbedRole.setDescription(
        blacklistedEmbedRole.data.description
          .replace(/\{target\}/g, role)
          .replace(/\{target\.tag\}/g, sanitizeInput(role.name))
          .replace(/\{reason\}/g, reason)
          .replace(/\{duration\}/g, duration),
      );
    }

    const roleExists = await blacklistDB.has(`role-${role.id}`);
    if (roleExists) {
      // Role is already blacklisted
      return interaction.editReply({
        embeds: [alreadyBlacklistedEmbedRole],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // Role is not blacklisted
      await blacklistDB.set(`role-${role.id}`, {
        reason: reason,
        timestamp: Date.now(),
        staff: interaction.user.id,
        duration: duration,
      });
      await logMessage(
        `${interaction.user.tag} added ${role.name} to the blacklist with reason ${reason} and duration ${duration}.`,
      );
      let logChannelId = config.logs.blacklistAdd || config.logs.default;
      let logChannel = await getChannel(logChannelId);

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
          name: config.logBlacklistEmbed.field_staff || "• Staff",
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logBlacklistEmbed.field_target || "• Target",
          value: `> ${role}\n> ${sanitizeInput(role.name)}`,
        },
        {
          name: config.logBlacklistEmbed.field_reason || "• Reason",
          value: `> ${reason}`,
        },
        {
          name: config.logBlacklistEmbed.field_duration || "• Duration",
          value: `> ${duration}`,
        },
      ]);
      if (config.toggleLogs.blacklistAdd) {
        try {
          await logChannel.send({ embeds: [logBlacklistEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      return interaction.editReply({
        embeds: [blacklistedEmbedRole],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

async function blacklistRemove(
  interaction,
  user,
  member,
  reason = "No reason provided.",
  role = null,
) {
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
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // User is blacklisted
      await blacklistDB.delete(`user-${user.id}`);
      const blacklistRoles = config.rolesOnBlacklist || [];
      blacklistRoles.forEach(async (roleId) => {
        const role = await getRole(roleId);
        if (role) {
          await member.roles
            .remove(role)
            .catch((error) =>
              console.error(
                `Error removing role from blacklisted user: ${error}`,
              ),
            );
        } else {
          console.error(`Role with ID ${roleId} not found.`);
        }
      });
      await logMessage(
        `${interaction.user.tag} removed ${user.tag} from the blacklist with reason ${reason}.`,
      );
      let logChannelId = config.logs.blacklistRemove || config.logs.default;
      let logChannel = await getChannel(logChannelId);

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
          name: config.logUnblacklistEmbed.field_staff || "• Staff",
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_target || "• Target",
          value: `> ${user}\n> ${sanitizeInput(user.tag)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_reason || "• Reason",
          value: `> ${reason}`,
        },
      ]);
      if (config.toggleLogs.blacklistRemove) {
        try {
          await logChannel.send({ embeds: [logUnblacklistEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }

      return interaction.editReply({
        embeds: [unblacklistedEmbedUser],
        flags: MessageFlags.Ephemeral,
      });
    }
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
        "**{target} ({target.tag})** has been removed from the blacklist.\nReason: **{reason}**",
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
          .replace(/\{target\.tag\}/g, sanitizeInput(role.name))
          .replace(/\{reason\}/g, reason),
      );
    }

    const roleExists = await blacklistDB.has(`role-${role.id}`);
    if (!roleExists) {
      // Role is not blacklisted
      return interaction.editReply({
        embeds: [notBlacklistedEmbedRole],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // Role is blacklisted
      await blacklistDB.delete(`role-${role.id}`);
      await logMessage(
        `${interaction.user.tag} removed ${role.name} from the blacklist with reason ${reason}.`,
      );
      let logChannelId = config.logs.blacklistRemove || config.logs.default;
      let logChannel = await getChannel(logChannelId);

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
          name: config.logUnblacklistEmbed.field_staff || "• Staff",
          value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_target || "• Target",
          value: `> ${role}\n> ${sanitizeInput(role.name)}`,
        },
        {
          name: config.logUnblacklistEmbed.field_reason || "• Reason",
          value: `> ${reason}`,
        },
      ]);
      if (config.toggleLogs.blacklistRemove) {
        try {
          await logChannel.send({ embeds: [logUnblacklistEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }

      return interaction.editReply({
        embeds: [unblacklistedEmbedRole],
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

module.exports = {
  blacklistAdd,
  blacklistRemove,
};
