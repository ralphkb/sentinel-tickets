const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { client, blacklistDB } = require("../../init.js");
const {
  configEmbed,
  sanitizeInput,
  getRole,
  getChannel,
  logMessage,
  parseDurationToMilliseconds,
} = require("../../utils/mainUtils.js");

module.exports = {
  enabled: config.commands.blacklist.enabled,
  data: new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Manage the blacklist.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a user or role to the blacklist.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select a user")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Select a role")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("The reason for adding to the blacklist")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("duration")
            .setDescription("The duration of the blacklist")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a user or role from the blacklist.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Select a user")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Select a role")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("The reason for removing from the blacklist")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("List users or roles in the blacklist.")
        .addIntegerOption((option) =>
          option
            .setName("page")
            .setDescription("The page number")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Specify whether to list users or roles")
            .setRequired(false)
            .addChoices(
              { name: "Users", value: "users" },
              { name: "Roles", value: "roles" },
            ),
        ),
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
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "add") {
      let user = interaction.options.getUser("user");
      let member;
      if (user) {
        member = interaction.guild.members.cache.get(user.id);
      }
      let role = interaction.options.getRole("role");
      let duration = interaction.options.getString("duration") || "permanent";
      let reason =
        interaction.options.getString("reason") || "No reason provided.";
      await interaction.deferReply({ ephemeral: true });

      if ((!user && !role) || (user && role)) {
        return interaction.editReply({
          content:
            "Please provide either a user or a role, but not both or none.",
          ephemeral: true,
        });
      }

      if (duration !== "permanent") {
        const durationRegex = /^[0-9]+[smhdw]$/;
        if (!durationRegex.test(duration)) {
          return interaction.editReply({
            content:
              "Invalid duration format, please use one of the following formats: 1s 1m 1h 1d 1w (e.g. 5s, 10m, 2h, 3d, 4w)",
            ephemeral: true,
          });
        }
      }

      if (user) {
        const failedDefault = {
          color: "#2FF200",
          description:
            "**{target} ({target.tag})** is already in the blacklist.",
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

        if (
          blacklistedEmbedUser.data &&
          blacklistedEmbedUser.data.description
        ) {
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
            ephemeral: true,
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
                  console.error(
                    `Error adding role to blacklisted user: ${error}`,
                  ),
                );
            } else {
              console.error(`Role with ID ${roleId} not found.`);
            }
          });
          logMessage(
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
            {
              name: config.logBlacklistEmbed.field_duration,
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
            ephemeral: true,
          });
        }
      }

      if (role) {
        const failedDefault = {
          color: "#2FF200",
          description:
            "**{target} ({target.tag})** is already in the blacklist.",
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

        if (
          blacklistedEmbedRole.data &&
          blacklistedEmbedRole.data.description
        ) {
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
            ephemeral: true,
          });
        } else {
          // Role is not blacklisted
          await blacklistDB.set(`role-${role.id}`, {
            reason: reason,
            timestamp: Date.now(),
            staff: interaction.user.id,
            duration: duration,
          });
          logMessage(
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
              name: config.logBlacklistEmbed.field_staff,
              value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
            },
            {
              name: config.logBlacklistEmbed.field_target,
              value: `> ${role}\n> ${sanitizeInput(role.name)}`,
            },
            {
              name: config.logBlacklistEmbed.field_reason,
              value: `> ${reason}`,
            },
            {
              name: config.logBlacklistEmbed.field_duration,
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
            ephemeral: true,
          });
        }
      }
    }

    if (subcommand === "remove") {
      let user = interaction.options.getUser("user");
      let member;
      if (user) {
        member = interaction.guild.members.cache.get(user.id);
      }
      let role = interaction.options.getRole("role");
      let reason =
        interaction.options.getString("reason") || "No reason provided.";
      await interaction.deferReply({ ephemeral: true });

      if ((!user && !role) || (user && role)) {
        return interaction.editReply({
          content:
            "Please provide either a user or a role, but not both or none.",
          ephemeral: true,
        });
      }

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
            ephemeral: true,
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
          logMessage(
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
            try {
              await logChannel.send({ embeds: [logUnblacklistEmbed] });
            } catch (error) {
              error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
              client.emit("error", error);
            }
          }

          return interaction.editReply({
            embeds: [unblacklistedEmbedUser],
            ephemeral: true,
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
            ephemeral: true,
          });
        } else {
          // Role is blacklisted
          await blacklistDB.delete(`role-${role.id}`);
          logMessage(
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
              name: config.logUnblacklistEmbed.field_staff,
              value: `> ${interaction.user}\n> ${sanitizeInput(interaction.user.tag)}`,
            },
            {
              name: config.logUnblacklistEmbed.field_target,
              value: `> ${role}\n> ${sanitizeInput(role.name)}`,
            },
            {
              name: config.logUnblacklistEmbed.field_reason,
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
            ephemeral: true,
          });
        }
      }
    }
    if (subcommand === "list") {
      await interaction.deferReply({ ephemeral: true });
      const page = interaction.options.getInteger("page") || 1;
      if (page < 0) {
        return interaction.editReply({
          content:
            "Please provide a valid page number greater than or equal to 1.",
          ephemeral: true,
        });
      }
      const type = interaction.options.getString("type") || "users";
      const pageSize = 10;
      const startIndex = (page - 1) * pageSize;
      const endIndex = page * pageSize;
      const blacklistData = await blacklistDB.all();
      if (blacklistData.length === 0) {
        return interaction.editReply({
          content: `The blacklist is currently empty!`,
          ephemeral: true,
        });
      }
      const totalEntries = blacklistData.filter((entry) =>
        entry.id.startsWith(`${type === "users" ? "user" : "role"}-`),
      );
      const totalEntriesCount = totalEntries.length;
      if (totalEntriesCount === 0) {
        return interaction.editReply({
          content: `The ${type} blacklist is currently empty!`,
          ephemeral: true,
        });
      }
      const maxPage = Math.ceil(totalEntriesCount / pageSize);
      if (page > maxPage) {
        return interaction.editReply({
          content: `The specified page does not exist. Please choose a page between 1 and ${maxPage}.`,
          ephemeral: true,
        });
      }
      const sortedBlacklistedEntries = totalEntries.sort(
        (a, b) => a.value.timestamp - b.value.timestamp,
      );

      const paginatedEntries = sortedBlacklistedEntries.slice(
        startIndex,
        endIndex,
      );

      const failedDefault = {
        color: "#2FF200",
        title: `Blacklisted ${type === "users" ? "Users" : "Roles"} - Page ${page}`,
      };

      const blacklistListEmbed = await configEmbed(
        "blacklistListEmbed",
        failedDefault,
      );

      if (blacklistListEmbed.data && blacklistListEmbed.data.title) {
        blacklistListEmbed.setTitle(
          blacklistListEmbed.data.title
            .replace(/\{type\}/g, `${type === "users" ? "Users" : "Roles"}`)
            .replace(/\{page\}/g, `${page}`),
        );
      }

      let description = "";
      paginatedEntries.forEach((entry, index) => {
        const id = entry.id.split("-")[1];
        const userOrRole = type === "users" ? `<@${id}>` : `<@&${id}>`;
        const reason = entry.value.reason;
        const timestamp = entry.value.timestamp;
        const duration = entry.value.duration || "permanent";
        const staffID = entry.value.staff;
        const expirationTime =
          timestamp + parseDurationToMilliseconds(duration);
        const expires =
          duration === "permanent"
            ? "never"
            : `<t:${Math.floor(expirationTime / 1000)}:R>`;
        const timeAgo = `<t:${Math.floor(timestamp / 1000)}:R>`;
        description += `${startIndex + index + 1}. ${userOrRole}\nStaff: <@${staffID}>\nReason: ${reason}\nTime: ${timeAgo}\nDuration: ${duration}\nExpires: ${expires}\n`;
      });

      blacklistListEmbed.setDescription(description);

      await interaction.editReply({
        embeds: [blacklistListEmbed],
      });
    }
  },
};
